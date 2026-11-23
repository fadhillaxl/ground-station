"""Singleton service managing Direwolf KISS TCP connection, rigctld read-only health check, and packet feed."""

from __future__ import annotations

import asyncio
import collections
import glob
import logging
import os
import shutil
import struct
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

from direwolf.kiss import (
    KISS_CMD_DATA,
    KISSFrameError,
    KISSStreamDecoder,
    build_ax25_frame,
    frame_kiss,
    parse_ax25_frame,
    unframe_kiss,
)

logger = logging.getLogger("direwolf-service")


def _build_candidate_hosts(primary_host: str) -> list[str]:
    """Return ordered list of unique host addresses to reach host services from container or host."""
    candidates = [
        primary_host.strip(),
        "127.0.0.1",
        "localhost",
        "host.docker.internal",
        "host.containers.internal",
        "172.17.0.1",
    ]
    seen: set[str] = set()
    ordered: list[str] = []
    for h in candidates:
        if h and h not in seen:
            seen.add(h)
            ordered.append(h)
    return ordered


def _normalize_pcm_block(mono_samples: list[float]) -> list[float]:
    """Apply soft AGC boost to quiet USB Audio AF output from Icom IC-9700 so SSTV sync detects reliably."""
    if not mono_samples:
        return mono_samples
    peak = max((abs(x) for x in mono_samples), default=0.0)
    # Boost active audio (> -62 dBFS) toward 0.45 amplitude (max 25x gain) without amplifying dead silence
    if 0.0008 < peak < 0.35:
        gain = min(25.0, 0.45 / peak)
        return [max(-1.0, min(1.0, x * gain)) for x in mono_samples]
    return mono_samples


def _downmix_stereo_and_normalize(samples: list[float], channels: int) -> list[float]:
    """Downmix 2-channel IC-9700 USB audio (Left=Main VFO, Right=Sub VFO) to mono and apply soft AGC."""
    if channels == 2 and len(samples) >= 2:
        left = samples[0::2]
        right = samples[1::2]
        peak_l = max((abs(x) for x in left), default=0.0)
        peak_r = max((abs(x) for x in right), default=0.0)
        # Automatically pick the active VFO (Main or Sub) or sum both if comparable
        if peak_l > peak_r * 1.5:
            mono = left
        elif peak_r > peak_l * 1.5:
            mono = right
        else:
            mono = [(l_val + r_val) * 0.5 for l_val, r_val in zip(left, right)]
        return _normalize_pcm_block(mono)
    return _normalize_pcm_block(samples)


def _discover_alsa_capture_candidates(dev_id: str) -> list[tuple[str, str]]:
    """Build ordered list of (alsa_device, label) for Icom IC-9700 USB Audio CODEC from /proc/asound/cards."""
    candidates: list[tuple[str, str]] = []

    if dev_id.startswith("server:alsa:") and dev_id != "server:alsa-codec":
        card_idx = dev_id.split(":")[-1].strip()
        if card_idx:
            candidates.append((f"plughw:{card_idx},0", f"ALSA plughw:{card_idx},0"))
            candidates.append((f"hw:{card_idx},0", f"ALSA hw:{card_idx},0"))

    parsed_cards: list[tuple[str, str, bool]] = []
    try:
        if os.path.exists("/proc/asound/cards"):
            with open("/proc/asound/cards", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line_s = line.strip()
                    if not line_s or not line_s[0].isdigit():
                        continue
                    card_num = line_s.split()[0].strip()
                    card_short = card_num
                    if "[" in line_s and "]" in line_s:
                        card_short = line_s.split("[", 1)[1].split("]", 1)[0].strip()
                    lower_line = line_s.lower()
                    is_usb_codec = any(
                        tok in lower_line
                        for tok in ("codec", "usb", "icom", "9700", "burr-brown", "pcm290", "audio")
                    )
                    parsed_cards.append((card_num, card_short, is_usb_codec))
    except Exception:
        pass

    # First pass: prioritize USB Audio CODEC / Icom cards
    for card_num, card_short, is_usb_codec in parsed_cards:
        if is_usb_codec:
            if card_short:
                candidates.append(
                    (
                        f"plughw:CARD={card_short},DEV=0",
                        f"ALSA plughw:CARD={card_short} (Card #{card_num})",
                    )
                )
            candidates.append((f"plughw:{card_num},0", f"ALSA plughw:{card_num},0 ({card_short})"))
            candidates.append((f"hw:{card_num},0", f"ALSA hw:{card_num},0 ({card_short})"))

    # Standard named CODEC devices
    candidates.extend(
        [
            ("plughw:CARD=CODEC,DEV=0", "ALSA plughw:CARD=CODEC,DEV=0"),
            ("plughw:CARD=CODEC_1,DEV=0", "ALSA plughw:CARD=CODEC_1,DEV=0"),
            ("plughw:1,0", "ALSA plughw:1,0"),
            ("plughw:0,0", "ALSA plughw:0,0"),
        ]
    )

    # Second pass: any other sound card on the host
    for card_num, card_short, is_usb_codec in parsed_cards:
        if not is_usb_codec:
            candidates.append((f"plughw:{card_num},0", f"ALSA plughw:{card_num},0 ({card_short})"))

    candidates.append(("default", "ALSA default"))

    deduped: list[tuple[str, str]] = []
    seen_devs: set[str] = set()
    for alsa_dev, label in candidates:
        if alsa_dev not in seen_devs:
            seen_devs.add(alsa_dev)
            deduped.append((alsa_dev, label))
    return deduped


class DirewolfService:
    """Manages auto-reconnecting KISS TCP client (port 8001) and non-intrusive rigctld probe (port 4532)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sio: Any = None

        self._kiss_primary_host = os.environ.get("DIREWOLF_KISS_HOST", "host.docker.internal")
        self._kiss_port = int(os.environ.get("DIREWOLF_KISS_PORT", "8001"))
        self._agwpe_port = int(os.environ.get("DIREWOLF_AGWPE_PORT", "8000"))

        self._rigctld_primary_host = os.environ.get("RIGCTLD_HOST", "host.docker.internal")
        self._rigctld_port = int(os.environ.get("RIGCTLD_PORT", "4532"))

        # Server-side Icom IC-9700 Serial / Audio port mapping (plugged into Server)
        # Default: COM3 for rigctld CAT control (:4532), COM4 / USB Audio CODEC for Server Audio
        self._rigctld_com_port = os.environ.get("ICOM_RIGCTLD_PORT_DEVICE", "COM3")
        self._audio_com_port = os.environ.get("ICOM_AUDIO_PORT_DEVICE", "COM4")
        self._server_audio_device_id = os.environ.get("ICOM_SERVER_AUDIO_ID", "server:icom-com4")
        self._server_audio_device_label = (
            f"[SERVER • {self._audio_com_port}] Icom IC-9700 USB Audio CODEC "
            f"(rigctld: {self._rigctld_com_port} → :{self._rigctld_port})"
        )
        self._input_source_mode = "server"  # 'server' | 'client_web'
        self._server_audio_streaming = False
        self._server_audio_backend = "idle"
        self._server_audio_sample_rate = 48000
        self._server_audio_task: Optional[asyncio.Task[Any]] = None

        # Connection states
        self._kiss_connected = False
        self._kiss_active_host: Optional[str] = None
        self._kiss_last_connected_at: Optional[str] = None
        self._kiss_reconnect_attempts = 0
        self._kiss_last_error: Optional[str] = None

        self._rigctld_connected = False
        self._rigctld_active_host: Optional[str] = None
        self._rigctld_latency_ms: Optional[float] = None
        self._rigctld_last_checked_at: Optional[str] = None

        # Packet history and statistics
        self._packets: collections.deque[dict[str, Any]] = collections.deque(maxlen=500)
        self._total_packets = 0
        self._ch0_packets = 0  # 1200 bps AFSK
        self._ch1_packets = 0  # 9600 bps FSK/GFSK
        self._last_packet_at: Optional[str] = None

        # Background asyncio tasks
        self._running = False
        self._kiss_task: Optional[asyncio.Task[Any]] = None
        self._health_task: Optional[asyncio.Task[Any]] = None

    def set_socketio(self, sio: Any) -> None:
        """Attach Socket.IO server instance for real-time packet and status broadcasts."""
        self._sio = sio

    async def _emit(self, event: str, payload: Any) -> None:
        if self._sio is not None:
            try:
                await self._sio.emit(event, payload)
            except Exception as exc:
                logger.debug("Failed to emit Socket.IO event %s: %s", event, exc)

    def start_background_tasks(
        self, task_registry: Optional[set[asyncio.Task[Any]]] = None
    ) -> None:
        """Start KISS auto-reconnect loop and non-intrusive rigctld health monitor in current event loop."""
        if self._running:
            return
        self._running = True
        loop = asyncio.get_running_loop()

        self._kiss_task = loop.create_task(self._kiss_client_loop(), name="direwolf-kiss-client")
        self._health_task = loop.create_task(
            self._rigctld_health_loop(), name="direwolf-rigctld-health"
        )

        if task_registry is not None:
            task_registry.add(self._kiss_task)
            task_registry.add(self._health_task)
            self._kiss_task.add_done_callback(task_registry.discard)
            self._health_task.add_done_callback(task_registry.discard)

    async def stop_background_tasks(self) -> None:
        """Cancel background tasks cleanly during application shutdown."""
        self._running = False
        await self.stop_server_audio_stream()
        for task in (self._kiss_task, self._health_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._kiss_task = None
        self._health_task = None

    async def probe_rigctld_readonly(self, timeout: float = 0.6) -> dict[str, Any]:
        """Perform a strictly read-only, non-intrusive TCP handshake check to manual rigctld (port 4532).

        IMPORTANT ARCHITECTURE RULE:
        Never send mutating CAT commands, never toggle PTT, and never kill/restart rigctld.
        Only verify TCP socket reachability on port 4532 and close immediately.
        """
        candidates = _build_candidate_hosts(self._rigctld_primary_host)
        checked_iso = datetime.now(timezone.utc).isoformat()

        for host in candidates:
            t0 = time.perf_counter()
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, self._rigctld_port),
                    timeout=timeout,
                )
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                del reader

                with self._lock:
                    self._rigctld_connected = True
                    self._rigctld_active_host = host
                    self._rigctld_latency_ms = latency_ms
                    self._rigctld_last_checked_at = checked_iso

                return self.get_status_dict()
            except Exception:
                continue

        with self._lock:
            self._rigctld_connected = False
            self._rigctld_active_host = None
            self._rigctld_latency_ms = None
            self._rigctld_last_checked_at = checked_iso

        return self.get_status_dict()

    async def probe_kiss_readonly(self, timeout: float = 0.5) -> bool:
        """Quick TCP reachability check to Direwolf KISS port 8001 if background loop is not connected."""
        if self._kiss_connected:
            return True
        for host in _build_candidate_hosts(self._kiss_primary_host):
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, self._kiss_port),
                    timeout=timeout,
                )
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                with self._lock:
                    self._kiss_connected = True
                    self._kiss_active_host = host
                    self._kiss_last_connected_at = datetime.now(timezone.utc).isoformat()
                    self._kiss_last_error = None
                return True
            except Exception:
                continue
        return False

    async def _rigctld_health_loop(self) -> None:
        """Periodically check manual rigctld TCP status on port 4532 and broadcast status."""
        while self._running:
            try:
                status = await self.probe_rigctld_readonly(timeout=0.6)
                await self._emit("direwolf-status", status)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("rigctld health probe error: %s", exc)
            await asyncio.sleep(5.0)

    async def _kiss_client_loop(self) -> None:
        """Auto-reconnecting TCP client for Direwolf KISS server on port 8001."""
        decoder = KISSStreamDecoder()

        while self._running:
            connected_host: Optional[str] = None
            reader: Optional[asyncio.StreamReader] = None
            writer: Optional[asyncio.StreamWriter] = None

            for host in _build_candidate_hosts(self._kiss_primary_host):
                try:
                    reader, writer = await asyncio.wait_for(
                        asyncio.open_connection(host, self._kiss_port),
                        timeout=1.5,
                    )
                    connected_host = host
                    break
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    with self._lock:
                        self._kiss_last_error = str(exc)

            if reader is None or writer is None or connected_host is None:
                with self._lock:
                    self._kiss_connected = False
                    self._kiss_active_host = None
                    self._kiss_reconnect_attempts += 1
                await asyncio.sleep(3.0)
                continue

            with self._lock:
                self._kiss_connected = True
                self._kiss_active_host = connected_host
                self._kiss_last_connected_at = datetime.now(timezone.utc).isoformat()
                self._kiss_reconnect_attempts = 0
                self._kiss_last_error = None

            logger.info(
                "Connected to Direwolf KISS TCP server at %s:%d",
                connected_host,
                self._kiss_port,
            )
            await self._emit("direwolf-status", self.get_status_dict())

            try:
                while self._running:
                    chunk = await reader.read(4096)
                    if not chunk:
                        break
                    frames = decoder.feed(chunk)
                    for channel, command, ax25_bytes in frames:
                        if command != KISS_CMD_DATA:
                            continue
                        try:
                            packet = parse_ax25_frame(ax25_bytes, channel=channel)
                            packet["sourceTransport"] = (
                                f"kiss_tcp://{connected_host}:{self._kiss_port}"
                            )
                            await self._record_and_emit_packet(packet)
                        except KISSFrameError as exc:
                            logger.debug("Discarded invalid AX.25 frame from KISS stream: %s", exc)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("Direwolf KISS stream read interrupted: %s", exc)
                with self._lock:
                    self._kiss_last_error = str(exc)
            finally:
                with self._lock:
                    self._kiss_connected = False
                    self._kiss_active_host = None
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass
                await self._emit("direwolf-status", self.get_status_dict())

            await asyncio.sleep(2.0)

    async def _record_and_emit_packet(self, packet: dict[str, Any]) -> dict[str, Any]:
        """Store parsed packet in memory buffer, update counters, and emit over Socket.IO."""
        with self._lock:
            self._packets.appendleft(packet)
            self._total_packets += 1
            if packet.get("channel") == 1:
                self._ch1_packets += 1
            else:
                self._ch0_packets += 1
            self._last_packet_at = packet.get("timestamp")

        await self._emit("direwolf-packet", packet)
        await self._emit("direwolf-status", self.get_status_dict())
        return packet

    def get_status_dict(self) -> dict[str, Any]:
        """Return complete status of Direwolf KISS bridge and external IC-9700 rigctld."""
        with self._lock:
            return {
                "kiss": {
                    "connected": self._kiss_connected,
                    "host": self._kiss_active_host or self._kiss_primary_host,
                    "port": self._kiss_port,
                    "agwpePort": self._agwpe_port,
                    "lastConnectedAt": self._kiss_last_connected_at,
                    "reconnectAttempts": self._kiss_reconnect_attempts,
                    "lastError": self._kiss_last_error,
                    "channels": [
                        {
                            "channel": 0,
                            "baudRate": 1200,
                            "modulation": "AFSK",
                            "packets": self._ch0_packets,
                        },
                        {
                            "channel": 1,
                            "baudRate": 9600,
                            "modulation": "FSK/GFSK",
                            "packets": self._ch1_packets,
                        },
                    ],
                },
                "rigctld": {
                    "connected": self._rigctld_connected,
                    "host": self._rigctld_active_host or self._rigctld_primary_host,
                    "port": self._rigctld_port,
                    "comPort": self._rigctld_com_port,
                    "latencyMs": self._rigctld_latency_ms,
                    "lastCheckedAt": self._rigctld_last_checked_at,
                    "radioModel": "Icom IC-9700",
                    "hamlibModelId": 3081,
                    "pttMethod": "RIG 2 (Hamlib NET rigctl)",
                    "readOnlyMonitor": True,
                },
                "serverAudio": {
                    "inputSourceMode": self._input_source_mode,
                    "rigctldComPort": self._rigctld_com_port,
                    "audioComPort": self._audio_com_port,
                    "deviceId": self._server_audio_device_id,
                    "deviceLabel": self._server_audio_device_label,
                    "sampleRate": self._server_audio_sample_rate,
                    "streaming": self._server_audio_streaming,
                    "captureBackend": self._server_audio_backend,
                },
                "stats": {
                    "totalPackets": self._total_packets,
                    "bufferedPackets": len(self._packets),
                    "channel0Packets1200": self._ch0_packets,
                    "channel1Packets9600": self._ch1_packets,
                    "lastPacketAt": self._last_packet_at,
                },
            }

    def get_packets(
        self,
        channel: Optional[int] = None,
        search: Optional[str] = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Return filtered packets from the in-memory ring buffer (newest first)."""
        with self._lock:
            items = list(self._packets)

        if channel is not None:
            items = [p for p in items if p.get("channel") == channel]

        if search and search.strip():
            q = search.strip().upper()
            items = [
                p
                for p in items
                if q in str(p.get("sourceCallsign", "")).upper()
                or q in str(p.get("destinationCallsign", "")).upper()
                or any(q in str(d).upper() for d in (p.get("digipeaters") or []))
                or q in str(p.get("satellitePreset", "")).upper()
                or q in str(p.get("payloadAscii", "")).upper()
                or q in str(p.get("payloadHex", "")).upper()
            ]

        return items[: max(1, min(limit, 500))]

    async def clear_packets(self) -> dict[str, Any]:
        """Clear buffered packet history and notify connected UI clients."""
        with self._lock:
            self._packets.clear()
            self._total_packets = 0
            self._ch0_packets = 0
            self._ch1_packets = 0
            self._last_packet_at = None

        status = self.get_status_dict()
        await self._emit("direwolf-cleared", {"clearedAt": datetime.now(timezone.utc).isoformat()})
        await self._emit("direwolf-status", status)
        return status

    async def ingest_raw_kiss_bytes(
        self,
        kiss_bytes: bytes,
        source_tag: str = "kiss_inject",
    ) -> list[dict[str, Any]]:
        """Un-frame one or more KISS frames, parse AX.25 headers/payloads, and broadcast to UI."""
        decoder = KISSStreamDecoder()
        frames = decoder.feed(kiss_bytes)
        if not frames:
            # Fallback if single KISS frame was passed without trailing FEND
            channel, command, ax25_bytes = unframe_kiss(kiss_bytes)
            frames = [(channel, command, ax25_bytes)]

        ingested: list[dict[str, Any]] = []
        for channel, command, ax25_bytes in frames:
            if command != KISS_CMD_DATA:
                continue
            packet = parse_ax25_frame(ax25_bytes, channel=channel)
            packet["sourceTransport"] = source_tag
            await self._record_and_emit_packet(packet)
            ingested.append(packet)

        if not ingested:
            raise KISSFrameError("No valid KISS data frames found in payload")
        return ingested

    async def ingest_structured_packet(
        self,
        source: str,
        destination: str,
        payload: bytes | str,
        digipeaters: Optional[list[str]] = None,
        channel: int = 0,
        control: int = 0x03,
        pid: int = 0xF0,
        source_tag: str = "simulator",
    ) -> dict[str, Any]:
        """Build AX.25 frame, wrap in KISS frame with byte stuffing, unframe, and ingest."""
        ax25_raw = build_ax25_frame(
            source=source,
            destination=destination,
            payload=payload,
            digipeaters=digipeaters,
            control=control,
            pid=pid,
        )
        kiss_framed = frame_kiss(ax25_raw, channel=channel)
        packets = await self.ingest_raw_kiss_bytes(kiss_framed, source_tag=source_tag)
        return packets[0]

    async def inject_satellite_presets(self) -> list[dict[str, Any]]:
        """Inject the 3 realistic satellite packets (LAPAN-A2/IO-86, ISS, CubeSat 9600 bps binary)."""
        results: list[dict[str, Any]] = []

        # 1. LAPAN-A2 / IO-86 APRS Digipeater Packet (1200 bps / Channel 0)
        p1 = await self.ingest_structured_packet(
            source="YB0X-1",
            destination="CQ",
            digipeaters=["ARISS", "SGATE"],
            payload="=0615.20S/10648.10E-LAPAN-A2/IO-86 Equatorial Orbit APRS Test Jakarta",
            channel=0,
            source_tag="sat_sim://lapan-a2-1200",
        )
        results.append(p1)

        # 2. ISS (International Space Station) Packet (1200 bps / Channel 0)
        p2 = await self.ingest_structured_packet(
            source="RS0ISS",
            destination="CQ",
            digipeaters=["ARISS"],
            payload=">ARISS - International Space Station Packet Digipeater Active",
            channel=0,
            source_tag="sat_sim://iss-1200",
        )
        results.append(p2)

        # 3. CubeSat Binary Telemetry Beacon (9600 bps / Channel 1)
        # Header 0x01 0xA4 0x0F 0x3C 0x1B 0x88 (VBAT=3.90V, OBC=27C, Solar=0x88) + extra binary telemetry bytes
        # including 0xC0 and 0xDB to verify KISS byte-stuffing in binary frames
        binary_payload = bytes(
            [
                0x01,
                0xA4,
                0x0F,
                0x3C,  # 3900 mV (3.90 V)
                0x1B,  # 27 °C OBC temperature
                0x88,  # Solar panel deployed & charging
                0x01,
                0xAE,  # 430 mA solar current
                0xC0,
                0xDB,
                0x00,
                0xFF,  # Raw binary sequence exercising KISS FEND/FESC stuffing
            ]
        )
        p3 = await self.ingest_structured_packet(
            source="CUBESAT-1",
            destination="BEACON",
            digipeaters=[],
            payload=binary_payload,
            channel=1,
            source_tag="sat_sim://cubesat-9600",
        )
        results.append(p3)

        return results

    def discover_server_devices(self) -> dict[str, Any]:
        """Discover server-side audio input devices and serial/COM ports for Icom IC-9700."""
        with self._lock:
            rig_com = self._rigctld_com_port
            aud_com = self._audio_com_port
            rig_port = self._rigctld_port

        audio_devices: list[dict[str, Any]] = [
            {
                "deviceId": "server:icom-com4",
                "label": f"[SERVER • {aud_com}] Icom IC-9700 USB Audio CODEC (Server • rigctld: {rig_com} → :{rig_port})",
                "isIcomCodec": True,
                "sourceType": "server",
                "comPort": aud_com,
                "rigctldComPort": rig_com,
                "sampleRate": 48000,
            },
            {
                "deviceId": "server:alsa-codec",
                "label": f"[SERVER • ALSA] Icom IC-9700 plughw:CARD=CODEC,DEV=0 (48000 Hz • rigctld: {rig_com})",
                "isIcomCodec": True,
                "sourceType": "server",
                "comPort": aud_com,
                "rigctldComPort": rig_com,
                "sampleRate": 48000,
            },
        ]

        # Probe PortAudio / sounddevice on server if available
        try:
            import sounddevice as sd

            raw_devs = sd.query_devices()
            for idx, dev in enumerate(raw_devs):
                max_in = int(dev.get("max_input_channels", 0))
                if max_in > 0:
                    name = str(dev.get("name", f"Server Audio #{idx}")).strip()
                    is_icom = any(
                        tok in name.lower()
                        for tok in ("icom", "9700", "codec", "burr-brown", "pcm290", "usb")
                    )
                    audio_devices.append(
                        {
                            "deviceId": f"server:sd:{idx}",
                            "label": f"[SERVER • HW #{idx}] {name}",
                            "isIcomCodec": is_icom,
                            "sourceType": "server",
                            "comPort": aud_com,
                            "rigctldComPort": rig_com,
                            "sampleRate": int(dev.get("default_samplerate", 48000)),
                        }
                    )
        except Exception as exc:
            logger.debug("sounddevice query_devices unavailable on server: %s", exc)

        # Probe Linux ALSA /proc/asound/cards if present
        try:
            if os.path.exists("/proc/asound/cards"):
                with open("/proc/asound/cards", "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line_s = line.strip()
                        if line_s and line_s[0].isdigit():
                            is_icom = "codec" in line_s.lower() or "usb" in line_s.lower()
                            audio_devices.append(
                                {
                                    "deviceId": f"server:alsa:{line_s.split()[0]}",
                                    "label": f"[SERVER • ALSA Card] {line_s}",
                                    "isIcomCodec": is_icom,
                                    "sourceType": "server",
                                    "comPort": aud_com,
                                    "rigctldComPort": rig_com,
                                    "sampleRate": 48000,
                                }
                            )
        except Exception:
            pass

        # Discover serial / COM ports on server
        serial_ports: list[dict[str, Any]] = [
            {
                "port": "COM3",
                "role": "rigctld (CAT / CI-V Control • Hamlib Model 3081 → TCP :4532)",
                "recommendedFor": "rigctld",
            },
            {
                "port": "COM4",
                "role": "Audio / Data USB Port B (Icom IC-9700 USB Audio CODEC / PTT)",
                "recommendedFor": "audio",
            },
            {
                "port": "/dev/ttyUSB0",
                "role": "Linux USB CI-V Port A (if00 • rigctld -m 3081)",
                "recommendedFor": "rigctld",
            },
            {
                "port": "/dev/ttyUSB1",
                "role": "Linux USB Port B (if02 • Data / Audio companion)",
                "recommendedFor": "audio",
            },
        ]
        for pattern in ("/dev/ttyUSB*", "/dev/ttyACM*", "/dev/serial/by-id/*"):
            for path in sorted(glob.glob(pattern)):
                if not any(p["port"] == path for p in serial_ports):
                    serial_ports.append(
                        {
                            "port": path,
                            "role": "Detected Server USB Serial Device",
                            "recommendedFor": "auto",
                        }
                    )

        return {
            "audioDevices": audio_devices,
            "serialPorts": serial_ports,
            "activeConfig": self.get_status_dict()["serverAudio"],
        }

    async def update_server_config(
        self,
        rigctld_com_port: Optional[str] = None,
        audio_com_port: Optional[str] = None,
        device_id: Optional[str] = None,
        input_source_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update server-side Icom IC-9700 COM3/COM4 & audio source configuration."""
        with self._lock:
            if rigctld_com_port and rigctld_com_port.strip():
                self._rigctld_com_port = rigctld_com_port.strip()
            if audio_com_port and audio_com_port.strip():
                self._audio_com_port = audio_com_port.strip()
            if input_source_mode in ("server", "client_web"):
                self._input_source_mode = input_source_mode
            if device_id and device_id.strip():
                self._server_audio_device_id = device_id.strip()
                if self._server_audio_device_id.startswith("server:"):
                    self._input_source_mode = "server"
                else:
                    self._input_source_mode = "client_web"

            self._server_audio_device_label = (
                f"[SERVER • {self._audio_com_port}] Icom IC-9700 USB Audio CODEC "
                f"(rigctld: {self._rigctld_com_port} → :{self._rigctld_port})"
            )

        status = self.get_status_dict()
        await self._emit("direwolf-status", status)
        return status

    async def start_server_audio_stream(
        self,
        device_id: Optional[str] = None,
        rigctld_com_port: Optional[str] = None,
        audio_com_port: Optional[str] = None,
        sample_rate: int = 48000,
    ) -> dict[str, Any]:
        """Start capturing audio from the Server Icom IC-9700 (COM4 / USB Audio CODEC) and stream via Socket.IO."""
        await self.update_server_config(
            rigctld_com_port=rigctld_com_port,
            audio_com_port=audio_com_port,
            device_id=device_id or "server:icom-com4",
            input_source_mode="server",
        )
        await self.stop_server_audio_stream()

        with self._lock:
            self._server_audio_sample_rate = max(8000, min(int(sample_rate or 48000), 96000))
            self._server_audio_streaming = True
            self._server_audio_backend = "starting"

        loop = asyncio.get_running_loop()
        self._server_audio_task = loop.create_task(
            self._server_audio_capture_loop(),
            name="direwolf-server-audio-stream",
        )
        status = self.get_status_dict()
        await self._emit("direwolf-status", status)
        return status

    async def stop_server_audio_stream(self) -> dict[str, Any]:
        """Stop the server-side audio capture task cleanly."""
        with self._lock:
            self._server_audio_streaming = False
            self._server_audio_backend = "idle"
            task = self._server_audio_task
            self._server_audio_task = None

        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        status = self.get_status_dict()
        await self._emit("direwolf-status", status)
        return status

    async def _server_audio_capture_loop(self) -> None:
        """Background loop streaming 48 kHz Float32 PCM chunks from Server USB Audio CODEC to Web UI."""
        chunk_frames = 4096
        with self._lock:
            sample_rate = self._server_audio_sample_rate
            dev_id = self._server_audio_device_id
            dev_label = self._server_audio_device_label
            aud_com = self._audio_com_port
            rig_com = self._rigctld_com_port

        # Ensure ALSA/PortAudio runtime utilities exist inside container even without image rebuild
        if shutil.which("arecord") is None and os.path.exists("/usr/bin/apt-get"):
            try:
                with self._lock:
                    self._server_audio_backend = "Installing ALSA/PortAudio in container..."
                await self._emit("direwolf-status", self.get_status_dict())
                install_proc = await asyncio.create_subprocess_exec(
                    "sh",
                    "-c",
                    "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends alsa-utils libportaudio2",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(install_proc.wait(), timeout=45.0)
            except Exception as exc:
                logger.debug("Runtime ALSA/PortAudio install skipped: %s", exc)

        # 1. Try sounddevice (PortAudio) on the server unless user explicitly requested an ALSA card ID
        sd_stream = None
        pcm_queue: asyncio.Queue[list[float]] = asyncio.Queue(maxsize=16)
        loop = asyncio.get_running_loop()

        if not dev_id.startswith("server:alsa"):
            try:
                import sounddevice as sd

                target_sd_device: Any = None
                target_channels = 1
                if dev_id.startswith("server:sd:"):
                    target_sd_device = int(dev_id.split(":")[-1])
                    dev_info = sd.query_devices(target_sd_device)
                    target_channels = 2 if int(dev_info.get("max_input_channels", 1)) >= 2 else 1
                else:
                    for idx, d in enumerate(sd.query_devices()):
                        max_in = int(d.get("max_input_channels", 0))
                        if max_in > 0:
                            name = str(d.get("name", "")).lower()
                            if any(
                                k in name
                                for k in ("codec", "icom", "9700", "burr-brown", "pcm290", "usb")
                            ):
                                target_sd_device = idx
                                target_channels = 2 if max_in >= 2 else 1
                                break

                def _enqueue_samples(s: list[float]) -> None:
                    if not pcm_queue.full():
                        pcm_queue.put_nowait(s)

                def _sd_callback(
                    indata: Any, frames: int, time_info: Any, status_flags: Any
                ) -> None:
                    del frames, time_info, status_flags
                    try:
                        if indata.shape[1] >= 2:
                            interleaved: list[float] = (
                                indata[:, :2].reshape(-1).astype("float32").tolist()
                            )
                            samples = _downmix_stereo_and_normalize(interleaved, 2)
                        else:
                            raw_mono: list[float] = indata[:, 0].astype("float32").tolist()
                            samples = _normalize_pcm_block(raw_mono)
                        loop.call_soon_threadsafe(_enqueue_samples, samples)
                    except Exception:
                        pass

                sd_stream = sd.InputStream(
                    samplerate=sample_rate,
                    blocksize=chunk_frames,
                    device=target_sd_device,
                    channels=target_channels,
                    dtype="float32",
                    callback=_sd_callback,
                )
                sd_stream.start()
                with self._lock:
                    self._server_audio_backend = (
                        f"sounddevice ({aud_com} / USB Audio CODEC • {target_channels}ch)"
                    )
                await self._emit("direwolf-status", self.get_status_dict())
            except Exception as exc:
                logger.debug(
                    "Server sounddevice input stream not opened (%s); trying ALSA/bridge", exc
                )
                sd_stream = None

        try:
            if sd_stream is not None:
                while self._server_audio_streaming:
                    samples = await pcm_queue.get()
                    await self._emit(
                        "server-audio-pcm",
                        {
                            "samples": samples,
                            "sampleRate": sample_rate,
                            "deviceId": dev_id,
                            "deviceLabel": dev_label,
                            "audioComPort": aud_com,
                            "rigctldComPort": rig_com,
                            "captureBackend": "sounddevice",
                        },
                    )
                return

            # 2. Fallback: Try Linux ALSA `arecord` across all discovered IC-9700 / USB Audio CODEC devices
            alsa_candidates = _discover_alsa_capture_candidates(dev_id)
            for alsa_dev, alsa_label in alsa_candidates:
                for channels in (2, 1):
                    if not self._server_audio_streaming:
                        return
                    arecord_proc = None
                    bytes_per_chunk = chunk_frames * 2 * channels
                    try:
                        arecord_proc = await asyncio.create_subprocess_exec(
                            "arecord",
                            "-D",
                            alsa_dev,
                            "-f",
                            "S16_LE",
                            "-r",
                            str(sample_rate),
                            "-c",
                            str(channels),
                            "-t",
                            "raw",
                            "-q",
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.DEVNULL,
                        )
                        # Read first chunk to verify the ALSA hardware stream is delivering live samples
                        initial = await asyncio.wait_for(
                            arecord_proc.stdout.readexactly(bytes_per_chunk),  # type: ignore[union-attr]
                            timeout=1.2,
                        )
                        with self._lock:
                            self._server_audio_backend = f"{alsa_label} ({aud_com} • {channels}ch)"
                        logger.info(
                            "Streaming server Icom IC-9700 audio from %s (%d Hz, %d ch)",
                            alsa_dev,
                            sample_rate,
                            channels,
                        )
                        await self._emit("direwolf-status", self.get_status_dict())

                        raw_buf = initial
                        while self._server_audio_streaming:
                            count = len(raw_buf) // 2
                            ints = struct.unpack(f"<{count}h", raw_buf[: count * 2])
                            float_pcm = [val / 32768.0 for val in ints]
                            samples = _downmix_stereo_and_normalize(float_pcm, channels)
                            await self._emit(
                                "server-audio-pcm",
                                {
                                    "samples": samples,
                                    "sampleRate": sample_rate,
                                    "deviceId": dev_id,
                                    "deviceLabel": dev_label,
                                    "audioComPort": aud_com,
                                    "rigctldComPort": rig_com,
                                    "captureBackend": f"alsa_arecord ({alsa_dev})",
                                },
                            )
                            raw_buf = await arecord_proc.stdout.readexactly(bytes_per_chunk)  # type: ignore[union-attr]
                        return
                    except asyncio.CancelledError:
                        if arecord_proc is not None:
                            try:
                                arecord_proc.kill()
                            except Exception:
                                pass
                        raise
                    except Exception:
                        if arecord_proc is not None:
                            try:
                                arecord_proc.kill()
                            except Exception:
                                pass

            # 3. No hardware USB Audio CODEC exposed in /dev/snd: emit clean zero floor (no fake 380Hz tone)
            with self._lock:
                self._server_audio_backend = (
                    f"No USB Audio CODEC in /dev/snd ({aud_com} • mount /dev/snd in docker-compose)"
                )
            await self._emit("direwolf-status", self.get_status_dict())

            interval = chunk_frames / float(sample_rate)
            zero_samples = [0.0] * chunk_frames
            while self._server_audio_streaming:
                await self._emit(
                    "server-audio-pcm",
                    {
                        "samples": zero_samples,
                        "sampleRate": sample_rate,
                        "deviceId": dev_id,
                        "deviceLabel": dev_label,
                        "audioComPort": aud_com,
                        "rigctldComPort": rig_com,
                        "captureBackend": "no_audio_device_in_container",
                    },
                )
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass
        finally:
            if sd_stream is not None:
                try:
                    sd_stream.stop()
                    sd_stream.close()
                except Exception:
                    pass


# Global singleton instance
service = DirewolfService()
