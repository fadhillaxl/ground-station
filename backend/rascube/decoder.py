"""Decoder for RASCube binary telemetry packets."""

from __future__ import annotations

import dataclasses
import struct
import time
from typing import Any

from rascube.models import (
    BarometerTelemetry,
    EpsTelemetry,
    GpsTelemetry,
    ImuTelemetry,
    MainTelemetrySample,
    PowerMeasurement,
    Vector3,
)


class ProtocolDecodeError(ValueError):
    """Raised when incoming packet bytes cannot be parsed."""


def normalize_payload(raw: str | bytes | bytearray) -> tuple[int, bytes]:
    """Extract port and 121-byte payload from raw bytes or hex string.

    Supports:
    - 123 bytes: [port (0x10), len (121/0x79), 121-byte payload]
    - 122 bytes: [port (0x10), 121-byte payload]
    - 121 bytes: [121-byte payload]
    """
    if isinstance(raw, str):
        cleaned = raw.strip().replace(" ", "").replace("0x", "")
        try:
            data = bytes.fromhex(cleaned)
        except ValueError as exc:
            raise ProtocolDecodeError(f"Invalid hex string: {exc}") from exc
    else:
        data = bytes(raw)

    if len(data) == 123:
        port = data[0]
        length = data[1]
        if length != 121:
            raise ProtocolDecodeError(
                f"Expected length byte 0x79 (121), got 0x{length:02X} ({length})"
            )
        return port, data[2:]

    if len(data) == 122:
        return data[0], data[1:]

    if len(data) == 121:
        return 0x10, data

    raise ProtocolDecodeError(
        f"Telemetry packet must be 121 bytes (payload), 122 bytes (port+payload), "
        f"or 123 bytes (port+length+payload); got {len(data)} bytes"
    )


def decode_main_telemetry_bytes(
    payload: bytes, source: str = "client_web_serial"
) -> MainTelemetrySample:
    """Decode raw 121 bytes payload into a typed MainTelemetrySample."""
    if len(payload) != 121:
        raise ProtocolDecodeError(f"Main telemetry payload requires 121 bytes, got {len(payload)}")

    def u16(offset: int) -> int:
        return int(struct.unpack_from("<H", payload, offset)[0])

    def i16(offset: int) -> int:
        return int(struct.unpack_from("<h", payload, offset)[0])

    def f32(offset: int) -> float:
        return float(struct.unpack_from("<f", payload, offset)[0])

    magnetometer_raw = (i16(44), i16(46), i16(48))
    accelerometer_raw = (i16(60), i16(62), i16(64))
    gyroscope_raw = (i16(66), i16(68), i16(70))

    eps = EpsTelemetry(
        main_5v_v=u16(4) / 1000.0,
        main_3v3_v=u16(6) / 1000.0,
        solar_ldr_raw=(u16(8), u16(10), u16(12)),
        battery_charge=PowerMeasurement(i16(14) / 1000.0, i16(16) / 1000.0),
        usb=PowerMeasurement(i16(18) / 1000.0, i16(20) / 1000.0),
        battery_draw=PowerMeasurement(i16(22) / 1000.0, i16(24) / 1000.0),
        solar=(
            PowerMeasurement(i16(26) / 1000.0, i16(28) / 1000.0),
            PowerMeasurement(i16(30) / 1000.0, i16(32) / 1000.0),
            PowerMeasurement(i16(34) / 1000.0, i16(36) / 1000.0),
        ),
        charging_complete=bool(payload[38]),
        charge_power_good=bool(payload[39]),
    )

    imu = ImuTelemetry(
        magnetometer_raw=magnetometer_raw,
        magnetometer_gauss=Vector3(*(value * 8.0 / 32768.0 for value in magnetometer_raw)),
        accelerometer_raw=accelerometer_raw,
        accelerometer_g=Vector3(*(value * 0.000061 for value in accelerometer_raw)),
        gyroscope_raw=gyroscope_raw,
        gyroscope_dps=Vector3(*(value * 0.0175 for value in gyroscope_raw)),
        orientation_degrees=Vector3(f32(98), f32(102), f32(106)),
    )

    gps = GpsTelemetry(
        latitude=f32(72),
        longitude=f32(76),
        altitude_m=f32(80),
        speed_raw=f32(84),
        course_degrees=f32(88),
        hdop=f32(92),
        satellites=int(payload[96]),
        fix=bool(payload[97]),
    )

    return MainTelemetrySample(
        packet_sequence=struct.unpack_from("<I", payload, 0)[0],
        device_uptime_ms=struct.unpack_from("<I", payload, 40)[0],
        eps=eps,
        barometer=BarometerTelemetry(i16(50) / 10.0, f32(52) / 100.0, f32(56)),
        imu=imu,
        gps=gps,
        error_code=u16(110),
        stm_version=int(payload[112]),
        receiver_rssi=f32(113),
        receiver_snr=f32(117),
        raw_hex=payload.hex().upper(),
        timestamp=time.time(),
        source=source,
    )


def decode_main_telemetry_hex(
    hex_data: str | bytes | bytearray, source: str = "client_web_serial"
) -> MainTelemetrySample:
    """Decode raw hex string or byte sequence into a typed MainTelemetrySample."""
    _port, payload = normalize_payload(hex_data)
    sample = decode_main_telemetry_bytes(payload, source=source)
    if isinstance(hex_data, str):
        sample_dict = dataclasses.asdict(sample)
        sample_dict["raw_hex"] = hex_data.strip().upper()
    return sample


def sample_to_dict(sample: MainTelemetrySample) -> dict[str, Any]:
    """Convert MainTelemetrySample into a convenient dictionary for JSON/Socket.IO."""
    data = dataclasses.asdict(sample)
    # Add computed / top-level friendly aliases for easy UI consumption
    data["uptime_seconds"] = round(sample.device_uptime_ms / 1000.0, 2)
    data["environment"] = {
        "temperature_c": sample.barometer.temperature_c,
        "pressure_hpa": sample.barometer.pressure_hpa,
        "altitude_m": sample.barometer.altitude_m,
    }
    return data


def decode_telemetry_to_dict(
    hex_data: str | bytes | bytearray, source: str = "client_web_serial"
) -> dict[str, Any]:
    """Decode raw hex or bytes directly into a JSON-friendly telemetry dictionary."""
    sample = decode_main_telemetry_hex(hex_data, source=source)
    return sample_to_dict(sample)
