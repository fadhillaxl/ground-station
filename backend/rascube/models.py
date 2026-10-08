"""Data models and schemas for RASCube telemetry and camera handling."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True, slots=True)
class Vector3:
    x: float
    y: float
    z: float


@dataclass(frozen=True, slots=True)
class PowerMeasurement:
    bus_voltage_v: float
    current_a: float


@dataclass(frozen=True, slots=True)
class EpsTelemetry:
    main_5v_v: float
    main_3v3_v: float
    solar_ldr_raw: tuple[int, int, int]
    battery_charge: PowerMeasurement
    usb: PowerMeasurement
    battery_draw: PowerMeasurement
    solar: tuple[PowerMeasurement, PowerMeasurement, PowerMeasurement]
    charging_complete: bool
    charge_power_good: bool


@dataclass(frozen=True, slots=True)
class BarometerTelemetry:
    temperature_c: float
    pressure_hpa: float
    altitude_m: float


@dataclass(frozen=True, slots=True)
class ImuTelemetry:
    magnetometer_raw: tuple[int, int, int]
    magnetometer_gauss: Vector3
    accelerometer_raw: tuple[int, int, int]
    accelerometer_g: Vector3
    gyroscope_raw: tuple[int, int, int]
    gyroscope_dps: Vector3
    orientation_degrees: Vector3


@dataclass(frozen=True, slots=True)
class GpsTelemetry:
    latitude: float
    longitude: float
    altitude_m: float
    speed_raw: float
    course_degrees: float
    hdop: float
    satellites: int
    fix: bool


@dataclass(frozen=True, slots=True)
class MainTelemetrySample:
    packet_sequence: int
    device_uptime_ms: int
    eps: EpsTelemetry
    barometer: BarometerTelemetry
    imu: ImuTelemetry
    gps: GpsTelemetry
    error_code: int
    stm_version: int
    receiver_rssi: float
    receiver_snr: float
    raw_hex: str = ""
    timestamp: float = 0.0
    source: str = "client_web_serial"


@dataclass(frozen=True, slots=True)
class CameraBlock:
    index: int
    data: bytes
    metadata: Optional[dict[str, Any]] = None


@dataclass(frozen=True, slots=True)
class CameraImage:
    jpeg: bytes
    block_count: int
    duplicate_blocks: frozenset[int]
    captured_at: float
    duration_seconds: float


@dataclass
class RascubeStatus:
    is_connected: bool = False
    mode: str = "client_web_serial"
    connected_port: Optional[str] = None
    serial_number: int = 1581
    total_samples_received: int = 0
    last_received_time: Optional[float] = None
    camera_status: str = "idle"  # "idle", "capturing", "completed", "failed"
    error_message: Optional[str] = None
