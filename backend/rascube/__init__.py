"""RASCube module for Ground Station."""

from rascube.camera import CameraAssembler, CameraAssemblyError
from rascube.constants import DEFAULT_BAUDRATE, DEFAULT_SATELLITE_ID, HostPort, InboundPort
from rascube.decoder import (
    ProtocolDecodeError,
    decode_main_telemetry_hex,
    decode_telemetry_to_dict,
    normalize_payload,
)
from rascube.models import (
    BarometerTelemetry,
    CameraBlock,
    CameraImage,
    EpsTelemetry,
    GpsTelemetry,
    ImuTelemetry,
    MainTelemetrySample,
    RascubeStatus,
)
from rascube.service import service

__all__ = [
    "BarometerTelemetry",
    "CameraAssembler",
    "CameraAssemblyError",
    "CameraBlock",
    "CameraImage",
    "DEFAULT_BAUDRATE",
    "DEFAULT_SATELLITE_ID",
    "EpsTelemetry",
    "GpsTelemetry",
    "HostPort",
    "ImuTelemetry",
    "InboundPort",
    "MainTelemetrySample",
    "ProtocolDecodeError",
    "RascubeStatus",
    "decode_main_telemetry_hex",
    "decode_telemetry_to_dict",
    "normalize_payload",
    "service",
]
