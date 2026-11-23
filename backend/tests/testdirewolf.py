"""Unit tests for Direwolf KISS framing/un-framing, AX.25 callsign/payload parser, and API routes."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from direwolf.kiss import (
    KISS_FEND,
    KISSFrameError,
    KISSStreamDecoder,
    build_ax25_frame,
    decode_ax25_address,
    encode_ax25_address,
    frame_kiss,
    parse_ax25_frame,
    parse_kiss_packet,
    unframe_kiss,
)
from direwolf.service import DirewolfService
from handlers.entities.direwolf import router as direwolf_router

pytestmark = pytest.mark.unit


def get_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(direwolf_router)
    return app


def test_kiss_framing_and_byte_stuffing():
    """Verify KISS 0xC0 framing and 0xDB 0xDC / 0xDB 0xDD byte stuffing round-trip."""
    raw_ax25 = bytes([0x01, 0xC0, 0x02, 0xDB, 0xDC, 0xDD, 0xC0, 0xDB, 0xFF])
    framed = frame_kiss(raw_ax25, channel=1)

    # Frame must start and end with FEND (0xC0)
    assert framed[0] == KISS_FEND
    assert framed[-1] == KISS_FEND
    # No unescaped 0xC0 may exist inside the body
    assert KISS_FEND not in framed[1:-1]
    # Check escaped sequences 0xDB 0xDC (for 0xC0) and 0xDB 0xDD (for 0xDB) exist in body
    assert b"\xdb\xdc" in framed[1:-1]
    assert b"\xdb\xdd" in framed[1:-1]

    channel, command, decoded_ax25 = unframe_kiss(framed)
    assert channel == 1
    assert command == 0
    assert decoded_ax25 == raw_ax25


def test_kiss_stream_decoder_fragmented_chunks():
    """Verify stateful KISSStreamDecoder handles fragmented TCP chunks and multiple frames."""
    ax25_a = build_ax25_frame(
        source="YB0X-1",
        destination="CQ",
        digipeaters=["ARISS", "SGATE"],
        payload="=0615.20S/10648.10E-LAPAN-A2/IO-86",
    )
    ax25_b = build_ax25_frame(
        source="CUBESAT-1",
        destination="BEACON",
        payload=bytes([0x01, 0xA4, 0x0F, 0x3C, 0x1B, 0x88, 0xC0, 0xDB]),
    )

    kiss_stream = frame_kiss(ax25_a, channel=0) + frame_kiss(ax25_b, channel=1)
    decoder = KISSStreamDecoder()

    # Feed 5 bytes at a time to simulate TCP fragmentation
    extracted = []
    for i in range(0, len(kiss_stream), 5):
        extracted.extend(decoder.feed(kiss_stream[i : i + 5]))

    assert len(extracted) == 2
    assert extracted[0] == (0, 0, ax25_a)
    assert extracted[1] == (1, 0, ax25_b)


def test_ax25_address_encoding_and_decoding():
    """Verify 7-byte shifted ASCII + SSID encoding and extension bit handling."""
    encoded = encode_ax25_address("YB0X-1", is_last=False, repeated=True)
    assert len(encoded) == 7

    decoded = decode_ax25_address(encoded)
    assert decoded["callsign"] == "YB0X"
    assert decoded["ssid"] == 1
    assert decoded["formatted"] == "YB0X-1"
    assert decoded["repeated"] is True
    assert decoded["extension"] is False

    encoded_last = encode_ax25_address("RS0ISS", is_last=True)
    decoded_last = decode_ax25_address(encoded_last)
    assert decoded_last["callsign"] == "RS0ISS"
    assert decoded_last["ssid"] == 0
    assert decoded_last["formatted"] == "RS0ISS"
    assert decoded_last["extension"] is True


def test_three_satellite_simulation_scenarios():
    """Verify the 3 required satellite packet scenarios: LAPAN-A2/IO-86, ISS, and CubeSat 9600 bps."""
    # 1. LAPAN-A2 / IO-86 APRS Digipeater Packet (1200 bps / Channel 0)
    lapan_payload = "=0615.20S/10648.10E-LAPAN-A2/IO-86 Equatorial Orbit APRS Test Jakarta"
    lapan_ax25 = build_ax25_frame(
        source="YB0X-1",
        destination="CQ",
        digipeaters=["ARISS", "SGATE"],
        payload=lapan_payload,
    )
    lapan_kiss = frame_kiss(lapan_ax25, channel=0)
    pkt1 = parse_kiss_packet(lapan_kiss)

    assert pkt1["channel"] == 0
    assert pkt1["baudRate"] == 1200
    assert pkt1["sourceCallsign"] == "YB0X-1"
    assert pkt1["destinationCallsign"] == "CQ"
    assert pkt1["digipeaters"] == ["ARISS", "SGATE"]
    assert pkt1["controlField"] == "0x03"
    assert pkt1["pid"] == "0xF0"
    assert pkt1["payloadAscii"] == lapan_payload
    assert pkt1["satellitePreset"] == "LAPAN-A2 / IO-86"
    assert pkt1["decodedTelemetry"]["format"] == "APRS_POSITION"
    assert pkt1["decodedTelemetry"]["latitude"] == pytest.approx(-6.25333, rel=1e-3)
    assert pkt1["decodedTelemetry"]["longitude"] == pytest.approx(106.80167, rel=1e-3)

    # 2. ISS (International Space Station) Packet (1200 bps / Channel 0)
    iss_payload = ">ARISS - International Space Station Packet Digipeater Active"
    iss_ax25 = build_ax25_frame(
        source="RS0ISS",
        destination="CQ",
        digipeaters=["ARISS"],
        payload=iss_payload,
    )
    iss_kiss = frame_kiss(iss_ax25, channel=0)
    pkt2 = parse_kiss_packet(iss_kiss)

    assert pkt2["channel"] == 0
    assert pkt2["baudRate"] == 1200
    assert pkt2["sourceCallsign"] == "RS0ISS"
    assert pkt2["destinationCallsign"] == "CQ"
    assert pkt2["digipeaters"] == ["ARISS"]
    assert pkt2["payloadAscii"] == iss_payload
    assert pkt2["satellitePreset"] == "ISS (ARISS)"
    assert pkt2["decodedTelemetry"]["format"] == "APRS_STATUS"

    # 3. CubeSat Binary Telemetry Beacon (9600 bps / Channel 1)
    cubesat_binary = bytes([0x01, 0xA4, 0x0F, 0x3C, 0x1B, 0x88])
    cubesat_ax25 = build_ax25_frame(
        source="CUBESAT-1",
        destination="BEACON",
        payload=cubesat_binary,
    )
    cubesat_kiss = frame_kiss(cubesat_ax25, channel=1)
    pkt3 = parse_kiss_packet(cubesat_kiss)

    assert pkt3["channel"] == 1
    assert pkt3["baudRate"] == 9600
    assert pkt3["sourceCallsign"] == "CUBESAT-1"
    assert pkt3["destinationCallsign"] == "BEACON"
    assert pkt3["digipeaters"] == []
    assert pkt3["payloadHex"] == "01 A4 0F 3C 1B 88"
    assert pkt3["isBinary"] is True
    assert len(pkt3["payloadAscii"]) == 6  # Safe printable ASCII replacement (no control chars)
    assert pkt3["satellitePreset"] == "CubeSat Telemetry"
    assert pkt3["decodedTelemetry"]["format"] == "CUBESAT_BINARY_BEACON"
    metrics_by_key = {m["key"]: m["value"] for m in pkt3["decodedTelemetry"]["metrics"]}
    assert metrics_by_key["battery_voltage"] == 3.9
    assert metrics_by_key["obc_temperature"] == 27
    assert "DEPLOYED & CHARGING" in metrics_by_key["solar_panel_status"]


def test_invalid_kiss_and_ax25_error_handling():
    """Verify parser raises KISSFrameError on malformed frames."""
    with pytest.raises(KISSFrameError):
        unframe_kiss(b"\xc0\xc0")

    with pytest.raises(KISSFrameError):
        # Trailing FESC (0xDB)
        unframe_kiss(b"\xc0\x00\x01\xdb\xc0")

    with pytest.raises(KISSFrameError):
        # Too short AX.25 frame
        parse_ax25_frame(b"\x01\x02\x03")


def test_direwolf_api_endpoints():
    """Verify FastAPI endpoints for status, preset simulation, custom injection, and clear."""
    client = TestClient(get_test_app())

    # 1. Clear logs
    res = client.post("/api/direwolf/packets/clear")
    assert res.status_code == 200
    assert res.json()["success"] is True

    # 2. Simulate the 3 realistic satellite packets
    res = client.post("/api/direwolf/simulate/presets")
    assert res.status_code == 200
    sim_data = res.json()
    assert sim_data["success"] is True
    assert sim_data["count"] == 3

    # 3. Query packets list and filter by channel
    res_all = client.get("/api/direwolf/packets")
    assert res_all.status_code == 200
    assert res_all.json()["count"] == 3

    res_9600 = client.get("/api/direwolf/packets?channel=1")
    assert res_9600.status_code == 200
    assert res_9600.json()["count"] == 1
    assert res_9600.json()["packets"][0]["sourceCallsign"] == "CUBESAT-1"

    # 4. Query status (read-only rigctld probe disabled for fast unit test)
    res_status = client.get("/api/direwolf/status?probe=false")
    assert res_status.status_code == 200
    status_json = res_status.json()
    assert status_json["rigctld"]["port"] == 4532
    assert status_json["rigctld"]["hamlibModelId"] == 3081
    assert status_json["rigctld"]["readOnlyMonitor"] is True
    assert status_json["kiss"]["port"] == 8001
    assert status_json["stats"]["totalPackets"] == 3


@pytest.mark.asyncio
async def test_direwolf_kiss_tcp_stream_and_readonly_rigctld_probe():
    """Verify live TCP KISS ingestion and strictly read-only rigctld TCP handshake probe."""
    received_rigctld_bytes = bytearray()
    rigctld_accepted = asyncio.Event()

    async def handle_rigctld(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        rigctld_accepted.set()
        data = await reader.read(1024)
        received_rigctld_bytes.extend(data)
        writer.close()
        await writer.wait_closed()

    rig_server = await asyncio.start_server(handle_rigctld, "127.0.0.1", 0)
    rig_port = rig_server.sockets[0].getsockname()[1]

    # Build 3 realistic satellite KISS frames to stream over mock Direwolf KISS TCP server
    kiss_stream = b"".join(
        [
            frame_kiss(
                build_ax25_frame(
                    source="YB0X-1",
                    destination="CQ",
                    digipeaters=["ARISS", "SGATE"],
                    payload="=0615.20S/10648.10E-LAPAN-A2/IO-86 Equatorial Orbit APRS Test Jakarta",
                ),
                channel=0,
            ),
            frame_kiss(
                build_ax25_frame(
                    source="RS0ISS",
                    destination="CQ",
                    digipeaters=["ARISS"],
                    payload=">ARISS - International Space Station Packet Digipeater Active",
                ),
                channel=0,
            ),
            frame_kiss(
                build_ax25_frame(
                    source="CUBESAT-1",
                    destination="BEACON",
                    payload=bytes([0x01, 0xA4, 0x0F, 0x3C, 0x1B, 0x88, 0xC0, 0xDB]),
                ),
                channel=1,
            ),
        ]
    )

    async def handle_kiss(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.write(kiss_stream[:25])
        await writer.drain()
        await asyncio.sleep(0.02)
        writer.write(kiss_stream[25:])
        await writer.drain()
        await asyncio.sleep(0.1)
        writer.close()
        await writer.wait_closed()

    kiss_server = await asyncio.start_server(handle_kiss, "127.0.0.1", 0)
    kiss_port = kiss_server.sockets[0].getsockname()[1]

    emitted_events: list[tuple[str, object]] = []

    class DummySio:
        async def emit(self, event: str, data: object) -> None:
            emitted_events.append((event, data))

    svc = DirewolfService()
    svc._kiss_primary_host = "127.0.0.1"
    svc._kiss_port = kiss_port
    svc._rigctld_primary_host = "127.0.0.1"
    svc._rigctld_port = rig_port
    svc.set_socketio(DummySio())

    try:
        # 1. Verify read-only rigctld probe connects and sends ZERO mutating bytes
        status = await svc.probe_rigctld_readonly(timeout=1.0)
        await asyncio.wait_for(rigctld_accepted.wait(), timeout=1.0)
        assert status["rigctld"]["connected"] is True
        assert status["rigctld"]["port"] == rig_port
        assert len(received_rigctld_bytes) == 0

        # 2. Start background KISS TCP client loop and wait until all 3 frames arrive
        svc.start_background_tasks()
        for _ in range(40):
            if len(svc.get_packets()) >= 3:
                break
            await asyncio.sleep(0.05)

        packets = svc.get_packets()
        assert len(packets) == 3
        calls = {p["sourceCallsign"] for p in packets}
        assert calls == {"YB0X-1", "RS0ISS", "CUBESAT-1"}
        packet_events = [e for e in emitted_events if e[0] == "direwolf-packet"]
        assert len(packet_events) == 3
    finally:
        await svc.stop_background_tasks()
        kiss_server.close()
        await kiss_server.wait_closed()
        rig_server.close()
        await rig_server.wait_closed()
