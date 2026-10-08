"""Unit tests for RASCube protocol decoder, camera assembler, and service."""

import struct

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from handlers.entities.rascube import router as rascube_router
from rascube.camera import CameraAssembler, CameraAssemblyError, parse_camera_frame_bytes
from rascube.decoder import (
    ProtocolDecodeError,
    decode_main_telemetry_bytes,
    decode_telemetry_to_dict,
    normalize_payload,
)
from rascube.models import CameraBlock

pytestmark = pytest.mark.unit


def get_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(rascube_router)
    return app


def create_dummy_telemetry_bytes(
    seq: int = 42,
    uptime_ms: int = 123456,
    v5: int = 5020,
    v33: int = 3310,
    temp_tenth_deg: int = 245,
    press_cents_hpa: float = 101325.0,
    rssi: float = -78.5,
    snr: float = 9.2,
) -> bytes:
    """Builds a valid 121-byte synthetic RASCube main telemetry frame."""
    buf = bytearray(121)
    # 0..3: packet_sequence (u32)
    struct.pack_into("<I", buf, 0, seq)
    # 4..5: eps main 5V (u16)
    struct.pack_into("<H", buf, 4, v5)
    # 6..7: eps main 3.3V (u16)
    struct.pack_into("<H", buf, 6, v33)
    # 8..13: solar ldr (3 * u16)
    struct.pack_into("<HHH", buf, 8, 100, 200, 300)
    # 14..17: batt charge (i16, i16)
    struct.pack_into("<hh", buf, 14, 4150, 250)
    # 18..21: usb (i16, i16)
    struct.pack_into("<hh", buf, 18, 5000, 500)
    # 22..25: batt draw (i16, i16)
    struct.pack_into("<hh", buf, 22, 4120, -150)
    # 26..37: solar 3 measurements (3 * 2 * i16)
    struct.pack_into("<hhhhhh", buf, 26, 3000, 50, 3010, 60, 3020, 70)
    # 38: charging_complete (bool)
    buf[38] = 1
    # 39: charge_power_good (bool)
    buf[39] = 1
    # 40..43: device_uptime_ms (u32)
    struct.pack_into("<I", buf, 40, uptime_ms)
    # 44..49: magnetometer_raw (3 * i16)
    struct.pack_into("<hhh", buf, 44, 10, -20, 30)
    # 50..51: barometer temp (i16, in 0.1 C)
    struct.pack_into("<h", buf, 50, temp_tenth_deg)
    # 52..55: barometer press (f32)
    struct.pack_into("<f", buf, 52, press_cents_hpa)
    # 56..59: barometer alt (f32)
    struct.pack_into("<f", buf, 56, 150.5)
    # 60..65: accelerometer_raw (3 * i16)
    struct.pack_into("<hhh", buf, 60, 0, 10, 16384)
    # 66..71: gyroscope_raw (3 * i16)
    struct.pack_into("<hhh", buf, 66, 1, 2, 3)
    # 72..95: gps (lat, lon, alt, speed, course, hdop as f32)
    struct.pack_into("<ffffff", buf, 72, -6.2088, 106.8456, 25.0, 0.5, 90.0, 1.2)
    # 96: satellites
    buf[96] = 12
    # 97: fix
    buf[97] = 1
    # 98..109: orientation (3 * f32)
    struct.pack_into("<fff", buf, 98, 12.5, -3.2, 85.0)
    # 110..111: error_code (u16)
    struct.pack_into("<H", buf, 110, 0)
    # 112: stm_version (u8)
    buf[112] = 2
    # 113..116: rssi (f32)
    struct.pack_into("<f", buf, 113, rssi)
    # 117..120: snr (f32)
    struct.pack_into("<f", buf, 117, snr)

    assert len(buf) == 121
    return bytes(buf)


def test_normalize_payload():
    payload = create_dummy_telemetry_bytes()

    # 121 bytes raw
    port, p121 = normalize_payload(payload)
    assert port == 0x10
    assert len(p121) == 121

    # 122 bytes [port, payload]
    p122 = bytes([0x10]) + payload
    port, p_extracted = normalize_payload(p122)
    assert port == 0x10
    assert len(p_extracted) == 121

    # 123 bytes [port, len, payload]
    p123 = bytes([0x10, 121]) + payload
    port, p_extracted = normalize_payload(p123)
    assert port == 0x10
    assert len(p_extracted) == 121

    # Hex string
    hex_str = p123.hex()
    port, p_hex = normalize_payload(hex_str)
    assert port == 0x10
    assert len(p_hex) == 121

    # Invalid length raises ProtocolDecodeError
    with pytest.raises(ProtocolDecodeError):
        normalize_payload(b"\x10\x20\x30")


def test_decode_telemetry():
    raw = create_dummy_telemetry_bytes(seq=101, uptime_ms=5000, v5=5000, temp_tenth_deg=254)
    sample = decode_main_telemetry_bytes(raw)

    assert sample.packet_sequence == 101
    assert sample.device_uptime_ms == 5000
    assert sample.eps.main_5v_v == 5.0
    assert sample.barometer.temperature_c == 25.4
    assert sample.gps.satellites == 12
    assert sample.gps.fix is True

    # Dict decode
    as_dict = decode_telemetry_to_dict(raw.hex())
    assert as_dict["packet_sequence"] == 101
    assert as_dict["uptime_seconds"] == 5.0
    assert as_dict["environment"]["temperature_c"] == 25.4


def test_camera_assembler():
    assembler = CameraAssembler()
    assert assembler.block_count == 0

    # Block 0 with JPEG SOI (\xff\xd8)
    b0_data = b"\xff\xd8\x01\x02\x03\x04"
    block0 = CameraBlock(index=0, data=b0_data)
    res0 = assembler.add(block0)
    assert res0 is None
    assert assembler.block_count == 1

    # Partial preview should synthesize EOI
    partial = assembler.get_partial_jpeg()
    assert partial is not None
    assert partial.startswith(b"\xff\xd8")
    assert partial.endswith(b"\xff\xd9")

    # Block 1 with JPEG EOI (\xff\xd9)
    b1_data = b"\x05\x06\xff\xd9"
    block1 = CameraBlock(index=1, data=b1_data)
    res1 = assembler.add(block1)
    assert res1 is not None
    assert res1.startswith(b"\xff\xd8")
    assert res1.endswith(b"\xff\xd9")
    assert assembler.block_count == 2

    # Duplicate block
    assembler.add(block1)
    assert len(assembler.duplicates) == 1

    # Conflicting duplicate block should raise CameraAssemblyError
    with pytest.raises(CameraAssemblyError):
        assembler.add(CameraBlock(index=1, data=b"\x99\x99\x99\x99"))


def test_parse_camera_frame_bytes():
    # 242-byte block: 2-byte index + 240-byte data
    buf = bytearray(242)
    struct.pack_into("<H", buf, 0, 7)
    buf[2:] = b"A" * 240
    block = parse_camera_frame_bytes(bytes(buf))
    assert block.index == 7
    assert len(block.data) == 240


@pytest.mark.asyncio
async def test_rascube_service_and_api():
    client = TestClient(get_test_app())

    # 1. Check status
    res = client.get("/api/rascube/status")
    assert res.status_code == 200
    data = res.json()
    assert "is_connected" in data
    assert "serial_number" in data

    # 2. Update status
    res = client.post("/api/rascube/status", json={"is_connected": True, "serial_number": 1581})
    assert res.status_code == 200
    assert res.json()["is_connected"] is True

    # 3. Ingest telemetry
    raw_frame = bytes([0x10, 121]) + create_dummy_telemetry_bytes(seq=555)
    res = client.post("/api/rascube/telemetry/ingest", json={"hex": raw_frame.hex()})
    assert res.status_code == 200
    assert res.json()["status"] == "ingested"
    assert res.json()["telemetry"]["packet_sequence"] == 555

    # 4. Latest telemetry
    res = client.get("/api/rascube/telemetry/latest")
    assert res.status_code == 200
    assert res.json()["packet_sequence"] == 555

    # 5. Telemetry history
    res = client.get("/api/rascube/telemetry/history?limit=10")
    assert res.status_code == 200
    assert res.json()["count"] >= 1

    # 6. Camera capture start
    res = client.post("/api/rascube/camera/capture", json={"timeout": 10.0})
    assert res.status_code == 200
    assert res.json()["status"] == "capturing"

    # 7. Ingest camera block 0 (SOI) and block 1 (EOI)
    cam0 = bytearray(244)
    cam0[0] = 0x15
    cam0[1] = 242
    struct.pack_into("<H", cam0, 2, 0)
    cam0[4:10] = b"\xff\xd8\x11\x22\x33\x44"
    res = client.post("/api/rascube/camera/chunk/ingest", json={"hex": cam0.hex()})
    assert res.status_code == 200
    assert res.json()["chunk"]["index"] == 0

    cam1 = bytearray(244)
    cam1[0] = 0x15
    cam1[1] = 242
    struct.pack_into("<H", cam1, 2, 1)
    cam1[4:10] = b"\x55\x66\xff\xd9\x00\x00"
    res = client.post("/api/rascube/camera/chunk/ingest", json={"hex": cam1.hex()})
    assert res.status_code == 200
    assert res.json()["chunk"]["index"] == 1

    # 8. Camera status
    res = client.get("/api/rascube/camera/status")
    assert res.status_code == 200
    assert res.json()["has_image"] is True
    assert res.json()["status"] == "completed"

    # 9. Camera latest JPG binary
    res = client.get("/api/rascube/camera/latest.jpg")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.content.startswith(b"\xff\xd8")
    assert res.content.endswith(b"\xff\xd9")

    # 10. Decode endpoint
    res = client.post("/api/rascube/decode", json={"hex": raw_frame.hex()})
    assert res.status_code == 200
    assert res.json()["packet_sequence"] == 555
