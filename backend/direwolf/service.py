"""Singleton service managing Direwolf KISS TCP connection, rigctld read-only health check, and packet feed."""

from __future__ import annotations

import asyncio
import collections
import logging
import os
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
                    "latencyMs": self._rigctld_latency_ms,
                    "lastCheckedAt": self._rigctld_last_checked_at,
                    "radioModel": "Icom IC-9700",
                    "hamlibModelId": 3081,
                    "pttMethod": "RIG 2 (Hamlib NET rigctl)",
                    "readOnlyMonitor": True,
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


# Global singleton instance
service = DirewolfService()
