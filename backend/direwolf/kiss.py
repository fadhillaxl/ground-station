"""KISS framing/un-framing and AX.25 frame encoder/decoder for satellite packet telemetry."""

from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

# KISS protocol special byte constants (RFC / Chepponis & Karn)
KISS_FEND = 0xC0  # Frame End
KISS_FESC = 0xDB  # Frame Escape
KISS_TFEND = 0xDC  # Transposed Frame End
KISS_TFESC = 0xDD  # Transposed Frame Escape
KISS_CMD_DATA = 0x00  # Data frame command nibble


class KISSFrameError(ValueError):
    """Raised when a KISS frame or AX.25 packet cannot be decoded."""


def frame_kiss(ax25_payload: bytes, channel: int = 0, command: int = KISS_CMD_DATA) -> bytes:
    """Wrap raw AX.25 frame bytes into a KISS frame with byte stuffing."""
    if not isinstance(ax25_payload, (bytes, bytearray)):
        raise KISSFrameError("AX.25 payload must be bytes")
    if not (0 <= channel <= 15):
        raise KISSFrameError(f"Invalid KISS radio channel: {channel}")

    cmd_byte = ((channel & 0x0F) << 4) | (command & 0x0F)
    raw_body = bytes([cmd_byte]) + bytes(ax25_payload)

    escaped = bytearray([KISS_FEND])
    for b in raw_body:
        if b == KISS_FEND:
            escaped.extend((KISS_FESC, KISS_TFEND))
        elif b == KISS_FESC:
            escaped.extend((KISS_FESC, KISS_TFESC))
        else:
            escaped.append(b)
    escaped.append(KISS_FEND)
    return bytes(escaped)


def unframe_kiss(kiss_bytes: bytes) -> tuple[int, int, bytes]:
    """Un-frame and un-escape a single KISS packet.

    Returns:
        Tuple of (channel, command, ax25_raw_bytes).
    """
    if not kiss_bytes:
        raise KISSFrameError("Empty KISS frame")

    # Strip surrounding FEND (0xC0) delimiters if present
    start = 0
    end = len(kiss_bytes)
    while start < end and kiss_bytes[start] == KISS_FEND:
        start += 1
    while end > start and kiss_bytes[end - 1] == KISS_FEND:
        end -= 1

    body = kiss_bytes[start:end]
    if not body:
        raise KISSFrameError("KISS frame contains only FEND delimiters")

    # Un-escape KISS byte stuffing (0xDB 0xDC -> 0xC0, 0xDB 0xDD -> 0xDB)
    unescaped = bytearray()
    i = 0
    length = len(body)
    while i < length:
        b = body[i]
        if b == KISS_FEND:
            # Unexpected unescaped FEND inside single frame
            raise KISSFrameError("Unescaped FEND (0xC0) encountered inside KISS frame body")
        if b == KISS_FESC:
            if i + 1 >= length:
                raise KISSFrameError("Trailing FESC (0xDB) at end of KISS frame")
            next_b = body[i + 1]
            if next_b == KISS_TFEND:
                unescaped.append(KISS_FEND)
            elif next_b == KISS_TFESC:
                unescaped.append(KISS_FESC)
            else:
                raise KISSFrameError(f"Invalid KISS escape sequence: 0xDB 0x{next_b:02X}")
            i += 2
        else:
            unescaped.append(b)
            i += 1

    if len(unescaped) < 2:
        raise KISSFrameError("KISS frame too short to contain command byte and AX.25 data")

    cmd_byte = unescaped[0]
    channel = (cmd_byte >> 4) & 0x0F
    command = cmd_byte & 0x0F
    return channel, command, bytes(unescaped[1:])


class KISSStreamDecoder:
    """Stateful TCP stream decoder for extracting KISS frames delimited by 0xC0."""

    def __init__(self, max_buffer_size: int = 65536) -> None:
        self._buffer = bytearray()
        self._in_frame = False
        self._max_buffer_size = max_buffer_size

    def feed(self, chunk: bytes) -> list[tuple[int, int, bytes]]:
        """Feed incoming TCP bytes and return a list of decoded (channel, command, ax25_bytes)."""
        frames: list[tuple[int, int, bytes]] = []
        for b in chunk:
            if b == KISS_FEND:
                if self._in_frame and len(self._buffer) > 0:
                    raw_frame = bytes(self._buffer)
                    self._buffer.clear()
                    try:
                        channel, command, ax25_bytes = unframe_kiss(raw_frame)
                        frames.append((channel, command, ax25_bytes))
                    except KISSFrameError:
                        # Discard malformed frame and continue listening on stream
                        pass
                else:
                    # Starting a new frame or skipping back-to-back FEND flags
                    self._buffer.clear()
                    self._in_frame = True
            else:
                if not self._in_frame:
                    # Accept bytes even if initial FEND was missed, or wait for FEND
                    self._in_frame = True
                if len(self._buffer) < self._max_buffer_size:
                    self._buffer.append(b)
                else:
                    # Guard against runaway garbage stream without FEND
                    self._buffer.clear()
                    self._in_frame = False
        return frames


def parse_callsign_token(callsign_token: str) -> tuple[str, int, bool]:
    """Parse a human-readable callsign token like 'YB0X-1', 'RS0ISS', or 'ARISS*'."""
    token = callsign_token.strip().upper()
    repeated = token.endswith("*")
    if repeated:
        token = token[:-1].strip()

    if "-" in token:
        base, ssid_str = token.rsplit("-", 1)
        try:
            ssid = int(ssid_str)
        except ValueError as exc:
            raise KISSFrameError(f"Invalid SSID in callsign '{callsign_token}'") from exc
    else:
        base = token
        ssid = 0

    base = base.strip()
    if not base or len(base) > 7 or not re.match(r"^[A-Z0-9]+$", base):
        raise KISSFrameError(
            f"Invalid AX.25 callsign '{callsign_token}' (must be 1-6 alphanumeric chars)"
        )
    if not (0 <= ssid <= 15):
        raise KISSFrameError(f"Invalid AX.25 SSID {ssid} in '{callsign_token}' (must be 0-15)")

    return base, ssid, repeated


def encode_ax25_address(
    callsign_token: str,
    is_last: bool = False,
    repeated: Optional[bool] = None,
    command_bit: bool = False,
) -> bytes:
    """Encode an AX.25 7-byte address subfield (6 shifted ASCII bytes + 1 SSID byte)."""
    base, ssid, parsed_repeated = parse_callsign_token(callsign_token)
    use_h_bit = parsed_repeated if repeated is None else repeated
    # Standard AX.25 address field holds 6 shifted ASCII chars; if a 7-char alias like
    # 'CUBESAT' is used in simulation, store first 6 chars and mark reserved bit 5 (0x40).
    has_seventh_t = len(base) == 7 and base == "CUBESAT"
    padded = base[:6].ljust(6, " ")

    addr = bytearray(7)
    for idx, ch in enumerate(padded):
        addr[idx] = (ord(ch) << 1) & 0xFE

    # SSID octet: [C/H bit (bit 7)] [R1 (bit 6)] [R0 (bit 5)] [SSID (bits 4..1)] [Extension bit (bit 0)]
    h_or_c = 0x80 if (use_h_bit or command_bit) else 0x00
    reserved_bits = 0x40 if has_seventh_t else 0x60
    ext = 0x01 if is_last else 0x00
    addr[6] = h_or_c | reserved_bits | ((ssid & 0x0F) << 1) | ext
    return bytes(addr)


def decode_ax25_address(addr_bytes: bytes) -> dict[str, Any]:
    """Decode a 7-byte AX.25 address subfield."""
    if len(addr_bytes) != 7:
        raise KISSFrameError(f"AX.25 address subfield must be 7 bytes, got {len(addr_bytes)}")

    chars: list[str] = []
    for b in addr_bytes[:6]:
        shifted = (b >> 1) & 0x7F
        if shifted == 0:
            chars.append(" ")
        elif 0x20 <= shifted <= 0x7E:
            chars.append(chr(shifted))
        else:
            raise KISSFrameError(f"Non-ASCII byte 0x{b:02X} in AX.25 callsign field")

    callsign = "".join(chars).strip()
    if not callsign or not re.match(r"^[A-Z0-9 -]{1,6}$", callsign):
        raise KISSFrameError(f"Invalid decoded AX.25 callsign: '{callsign}'")

    ssid_byte = addr_bytes[6]
    if callsign == "CUBESA" and (ssid_byte & 0x60) == 0x40:
        callsign = "CUBESAT"
    ssid = (ssid_byte >> 1) & 0x0F
    repeated = bool(ssid_byte & 0x80)
    extension = bool(ssid_byte & 0x01)
    formatted = f"{callsign}-{ssid}" if ssid > 0 else callsign

    return {
        "callsign": callsign,
        "ssid": ssid,
        "formatted": formatted,
        "repeated": repeated,
        "extension": extension,
    }


def build_ax25_frame(
    source: str,
    destination: str,
    payload: bytes | str,
    digipeaters: Optional[list[str]] = None,
    control: int = 0x03,
    pid: int = 0xF0,
) -> bytes:
    """Build a raw AX.25 UI frame from callsigns, optional digipeaters, and payload."""
    digis = [d.strip() for d in (digipeaters or []) if d and d.strip()]
    if len(digis) > 8:
        raise KISSFrameError("AX.25 allows at most 8 digipeaters")

    frame = bytearray()
    # Destination is always first (7 bytes, extension=0)
    frame.extend(encode_ax25_address(destination, is_last=False, command_bit=True))
    # Source is second (extension=1 if no digipeaters)
    frame.extend(encode_ax25_address(source, is_last=(len(digis) == 0)))

    for idx, digi in enumerate(digis):
        is_last = idx == len(digis) - 1
        frame.extend(encode_ax25_address(digi, is_last=is_last))

    frame.append(control & 0xFF)
    frame.append(pid & 0xFF)

    if isinstance(payload, str):
        frame.extend(payload.encode("utf-8"))
    else:
        frame.extend(payload)

    return bytes(frame)


def format_ascii_safe(payload_bytes: bytes) -> str:
    """Convert raw payload bytes into a printable ASCII string (non-printable bytes become '.')."""
    return "".join(chr(b) if 0x20 <= b <= 0x7E else "." for b in payload_bytes)


def format_hex_dump_lines(payload_bytes: bytes, bytes_per_line: int = 16) -> list[dict[str, str]]:
    """Build canonical 16-byte hex + ASCII dump rows for the UI Packet Inspector."""
    rows: list[dict[str, str]] = []
    if not payload_bytes:
        return rows

    for offset in range(0, len(payload_bytes), bytes_per_line):
        chunk = payload_bytes[offset : offset + bytes_per_line]
        left_hex = " ".join(f"{b:02X}" for b in chunk[:8])
        right_hex = " ".join(f"{b:02X}" for b in chunk[8:])
        hex_col = f"{left_hex}  {right_hex}".strip() if right_hex else left_hex
        ascii_col = format_ascii_safe(chunk)
        rows.append(
            {
                "offset": f"{offset:04X}",
                "hex": hex_col.ljust(bytes_per_line * 3 - 1 + (1 if bytes_per_line > 8 else 0)),
                "ascii": ascii_col,
            }
        )
    return rows


def detect_satellite_preset(
    source_callsign: str,
    destination_callsign: str,
    digipeaters: list[str],
    payload_ascii: str,
    payload_bytes: bytes,
    channel: int,
) -> str:
    """Automatically classify the satellite preset from AX.25 callsigns, digipeaters, and payload."""
    src_upper = source_callsign.upper()
    dst_upper = destination_callsign.upper()
    digis_upper = [d.upper() for d in digipeaters]
    payload_upper = payload_ascii.upper()

    # 1. LAPAN-A2 / IO-86 detection (YB0X-1, LAPAN, IO-86, SGATE)
    if (
        src_upper.startswith("YB0X")
        or dst_upper.startswith("YB0X")
        or any(d.startswith("YB0X") for d in digis_upper)
        or "LAPAN" in payload_upper
        or "IO-86" in payload_upper
    ):
        return "LAPAN-A2 / IO-86"

    # 2. ISS (International Space Station / ARISS)
    iss_calls = ("RS0ISS", "NA1SS", "DP0ISS", "OR4ISS", "IR0ISS")
    if (
        any(src_upper.startswith(c) for c in iss_calls)
        or any(dst_upper.startswith(c) for c in iss_calls)
        or any(any(d.startswith(c) for c in iss_calls) for d in digis_upper)
        or "INTERNATIONAL SPACE STATION" in payload_upper
        or (src_upper == "ARISS" or ("ARISS" in digis_upper and "LAPAN" not in payload_upper))
    ):
        return "ISS (ARISS)"

    # 3. CubeSat Binary Telemetry Beacon (9600 bps or CUBESAT/CUBESA callsign or 0x01 0xA4 header)
    if (
        "CUBESA" in src_upper
        or "CUBESA" in dst_upper
        or (len(payload_bytes) >= 2 and payload_bytes[0] == 0x01 and payload_bytes[1] == 0xA4)
        or channel == 1
    ):
        return "CubeSat Telemetry"

    # 4. Generic APRS packet
    if payload_ascii and payload_ascii[0] in ("=", "!", "/", "@", ">", ":", ";", "`", "'"):
        return "APRS Satellite"

    return "Generic AX.25"


def decode_satellite_telemetry_payload(
    source_callsign: str,
    destination_callsign: str,
    payload_bytes: bytes,
    payload_ascii: str,
    channel: int,
    satellite_preset: str,
) -> Optional[dict[str, Any]]:
    """Decode structured telemetry or APRS fields from known satellite payload formats."""
    if not payload_bytes:
        return None

    # Case 1: CubeSat Binary Telemetry Beacon (e.g. 0x01 0xA4 0x0F 0x3C 0x1B 0x88 ...)
    is_binary_payload = any(
        b < 0x20 or b > 0x7E for b in payload_bytes if b not in (0x0A, 0x0D, 0x09)
    )
    if (len(payload_bytes) >= 6 and payload_bytes[0] == 0x01 and payload_bytes[1] == 0xA4) or (
        satellite_preset == "CubeSat Telemetry" and is_binary_payload and len(payload_bytes) >= 6
    ):
        frame_type = payload_bytes[0]
        frame_header_id = f"0x{payload_bytes[0]:02X}{payload_bytes[1]:02X}"
        raw_vbat_mv = (payload_bytes[2] << 8) | payload_bytes[3]
        battery_voltage_v = round(raw_vbat_mv / 1000.0, 2)
        # Signed 8-bit OBC temperature in Celsius
        obc_temp_c = payload_bytes[4] - 256 if payload_bytes[4] > 127 else payload_bytes[4]
        solar_byte = payload_bytes[5]
        panel_deployed = bool(solar_byte & 0x80)
        panel_charging = bool(solar_byte & 0x08)
        solar_status = (
            "DEPLOYED & CHARGING"
            if (panel_deployed and panel_charging)
            else ("DEPLOYED" if panel_deployed else "STOWED")
        )

        metrics: list[dict[str, Any]] = [
            {
                "key": "telemetry_header",
                "label": "Telemetry Header",
                "value": frame_header_id,
                "unit": f"Type {frame_type}",
            },
            {
                "key": "battery_voltage",
                "label": "Battery Voltage",
                "value": battery_voltage_v,
                "unit": "V",
                "raw_hex": f"0x{payload_bytes[2]:02X}{payload_bytes[3]:02X}",
            },
            {
                "key": "obc_temperature",
                "label": "OBC Temperature",
                "value": obc_temp_c,
                "unit": "°C",
                "raw_hex": f"0x{payload_bytes[4]:02X}",
            },
            {
                "key": "solar_panel_status",
                "label": "Solar Panel Status",
                "value": f"{solar_status} (0x{solar_byte:02X})",
                "unit": "state",
                "raw_hex": f"0x{solar_byte:02X}",
            },
        ]

        # Optional extended bytes if present (e.g., bus current, uptime, RSSI)
        if len(payload_bytes) >= 8:
            solar_current_ma = (payload_bytes[6] << 8) | payload_bytes[7]
            metrics.append(
                {
                    "key": "solar_current",
                    "label": "Solar Array Current",
                    "value": solar_current_ma,
                    "unit": "mA",
                    "raw_hex": f"0x{payload_bytes[6]:02X}{payload_bytes[7]:02X}",
                }
            )

        return {
            "format": "CUBESAT_BINARY_BEACON",
            "summary": f"VBAT {battery_voltage_v:.2f} V • OBC {obc_temp_c} °C • Solar {solar_status}",
            "metrics": metrics,
        }

    # Case 2: APRS Position Packet (e.g. =0615.20S/10648.10E-LAPAN-A2/IO-86 ...)
    aprs_pos_match = re.match(
        r"^([=!])(\d{2})(\d{2}\.\d{2})([NS])([/\\])(\d{3})(\d{2}\.\d{2})([EW])(.)(.*)$",
        payload_ascii,
    )
    if aprs_pos_match:
        lat_deg = int(aprs_pos_match.group(2))
        lat_min = float(aprs_pos_match.group(3))
        lat_hem = aprs_pos_match.group(4)
        sym_table = aprs_pos_match.group(5)
        lon_deg = int(aprs_pos_match.group(6))
        lon_min = float(aprs_pos_match.group(7))
        lon_hem = aprs_pos_match.group(8)
        sym_code = aprs_pos_match.group(9)
        comment = aprs_pos_match.group(10).strip()

        lat_dd = round((lat_deg + lat_min / 60.0) * (-1 if lat_hem == "S" else 1), 5)
        lon_dd = round((lon_deg + lon_min / 60.0) * (-1 if lon_hem == "W" else 1), 5)

        return {
            "format": "APRS_POSITION",
            "summary": f"Pos {lat_deg:02d}°{lat_min:05.2f}'{lat_hem}, {lon_deg:03d}°{lon_min:05.2f}'{lon_hem} • {comment}",
            "latitude": lat_dd,
            "longitude": lon_dd,
            "symbol": f"{sym_table}{sym_code}",
            "comment": comment,
            "metrics": [
                {
                    "key": "aprs_type",
                    "label": "APRS Packet Type",
                    "value": "Position Report",
                    "unit": "",
                },
                {
                    "key": "latitude",
                    "label": "Latitude",
                    "value": f"{lat_dd}° ({lat_deg:02d}°{lat_min:05.2f}'{lat_hem})",
                    "unit": "",
                },
                {
                    "key": "longitude",
                    "label": "Longitude",
                    "value": f"{lon_dd}° ({lon_deg:03d}°{lon_min:05.2f}'{lon_hem})",
                    "unit": "",
                },
                {
                    "key": "comment",
                    "label": "Status / Comment",
                    "value": comment or "-",
                    "unit": "",
                },
            ],
        }

    # Case 3: APRS Status Report (e.g. >ARISS - International Space Station Packet Digipeater Active)
    if payload_ascii.startswith(">"):
        status_text = payload_ascii[1:].strip()
        return {
            "format": "APRS_STATUS",
            "summary": f"Status: {status_text}",
            "comment": status_text,
            "metrics": [
                {
                    "key": "aprs_type",
                    "label": "APRS Packet Type",
                    "value": "Status Report (>)",
                    "unit": "",
                },
                {
                    "key": "status_text",
                    "label": "Digipeater Status",
                    "value": status_text,
                    "unit": "",
                },
            ],
        }

    return None


def parse_ax25_frame(
    ax25_bytes: bytes,
    channel: int = 0,
    timestamp: Optional[str] = None,
) -> dict[str, Any]:
    """Parse raw AX.25 frame bytes into the structured telemetry packet schema required by the UI."""
    if not isinstance(ax25_bytes, (bytes, bytearray)):
        raise KISSFrameError("AX.25 frame must be bytes")
    if len(ax25_bytes) < 16:
        raise KISSFrameError(
            f"AX.25 frame too short ({len(ax25_bytes)} bytes); minimum 16 bytes required"
        )

    addresses: list[dict[str, Any]] = []
    offset = 0
    max_addresses = 10  # Destination + Source + up to 8 Digipeaters

    while offset + 7 <= len(ax25_bytes) and len(addresses) < max_addresses:
        addr_info = decode_ax25_address(bytes(ax25_bytes[offset : offset + 7]))
        addresses.append(addr_info)
        offset += 7
        if addr_info["extension"]:
            break
    else:
        raise KISSFrameError("AX.25 address field lacks HDLC extension termination bit")

    if len(addresses) < 2:
        raise KISSFrameError("AX.25 header must contain at least Destination and Source callsigns")
    if offset + 2 > len(ax25_bytes):
        raise KISSFrameError("AX.25 frame missing Control and PID fields after address header")

    dest_info = addresses[0]
    src_info = addresses[1]
    digi_infos = addresses[2:]

    control_byte = ax25_bytes[offset]
    pid_byte = ax25_bytes[offset + 1]
    payload_bytes = bytes(ax25_bytes[offset + 2 :])

    source_callsign = src_info["formatted"]
    destination_callsign = dest_info["formatted"]
    digipeaters = [d["formatted"] for d in digi_infos]

    payload_ascii = format_ascii_safe(payload_bytes)
    payload_hex = " ".join(f"{b:02X}" for b in payload_bytes)
    is_binary = any(b < 0x20 or b > 0x7E for b in payload_bytes if b not in (0x0A, 0x0D, 0x09))

    baud_rate = 9600 if channel == 1 else 1200
    modulation = "FSK/GFSK" if channel == 1 else "AFSK"
    channel_label = f"{baud_rate} bps"

    satellite_preset = detect_satellite_preset(
        source_callsign=source_callsign,
        destination_callsign=destination_callsign,
        digipeaters=digipeaters,
        payload_ascii=payload_ascii,
        payload_bytes=payload_bytes,
        channel=channel,
    )

    decoded_telemetry = decode_satellite_telemetry_payload(
        source_callsign=source_callsign,
        destination_callsign=destination_callsign,
        payload_bytes=payload_bytes,
        payload_ascii=payload_ascii,
        channel=channel,
        satellite_preset=satellite_preset,
    )

    iso_ts = timestamp or datetime.now(timezone.utc).isoformat()

    return {
        "id": f"pkt-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "timestamp": iso_ts,
        "channel": channel,
        "baudRate": baud_rate,
        "modulation": modulation,
        "channelLabel": channel_label,
        "sourceCallsign": source_callsign,
        "destinationCallsign": destination_callsign,
        "digipeaters": digipeaters,
        "digipeaterDetails": digi_infos,
        "controlField": f"0x{control_byte:02X}",
        "pid": f"0x{pid_byte:02X}",
        "payloadAscii": payload_ascii,
        "payloadHex": payload_hex,
        "payloadLength": len(payload_bytes),
        "isBinary": is_binary,
        "satellitePreset": satellite_preset,
        "decodedTelemetry": decoded_telemetry,
        "hexDumpLines": format_hex_dump_lines(payload_bytes),
        "rawBytes": list(ax25_bytes),
        "rawHex": " ".join(f"{b:02X}" for b in ax25_bytes),
        "headerDetails": {
            "source": src_info,
            "destination": dest_info,
            "headerLength": offset + 2,
            "totalFrameLength": len(ax25_bytes),
        },
    }


def parse_kiss_packet(
    raw_bytes: bytes,
    default_channel: Optional[int] = None,
    is_kiss_framed: bool = True,
) -> dict[str, Any]:
    """Convenience helper to parse either a KISS-framed packet or raw AX.25 bytes."""
    if is_kiss_framed and (
        raw_bytes.startswith(bytes([KISS_FEND])) or raw_bytes.endswith(bytes([KISS_FEND]))
    ):
        channel, command, ax25_bytes = unframe_kiss(raw_bytes)
        if command != KISS_CMD_DATA:
            raise KISSFrameError(f"Unsupported non-data KISS command nibble: 0x{command:X}")
        effective_channel = default_channel if default_channel is not None else channel
        return parse_ax25_frame(ax25_bytes, channel=effective_channel)

    effective_channel = default_channel if default_channel is not None else 0
    return parse_ax25_frame(raw_bytes, channel=effective_channel)
