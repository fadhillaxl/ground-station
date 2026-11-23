"""FastAPI router and endpoints for Direwolf KISS TCP bridge, AX.25 telemetry feed, and IC-9700 rigctld status."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from direwolf.kiss import KISSFrameError
from direwolf.service import service

logger = logging.getLogger("handlers-direwolf")

router = APIRouter(prefix="/api/direwolf", tags=["direwolf"])


def set_direwolf_socketio(sio_app: Any) -> None:
    """Register Socket.IO instance for real-time Direwolf packet and status broadcasts."""
    service.set_socketio(sio_app)


@router.get("/status")
async def get_direwolf_status(
    probe: bool = Query(
        True, description="Run non-intrusive TCP probe on rigctld:4532 and kiss:8001"
    ),
) -> dict[str, Any]:
    """Return Direwolf KISS TCP (8001) and manual rigctld (4532) read-only connection status."""
    if probe:
        await service.probe_rigctld_readonly(timeout=0.5)
        await service.probe_kiss_readonly(timeout=0.4)
    return service.get_status_dict()


@router.get("/packets")
async def get_direwolf_packets(
    channel: Optional[int] = Query(
        None, ge=0, le=15, description="Filter by KISS channel (0=1200bps, 1=9600bps)"
    ),
    search: Optional[str] = Query(None, description="Filter by callsign, preset, or payload"),
    limit: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    """Return buffered AX.25 packets decoded from Direwolf KISS bridge."""
    packets = service.get_packets(channel=channel, search=search, limit=limit)
    return {
        "count": len(packets),
        "packets": packets,
        "status": service.get_status_dict(),
    }


@router.post("/packets/clear")
async def clear_direwolf_packets() -> dict[str, Any]:
    """Clear all buffered AX.25 packets and reset counters."""
    status = await service.clear_packets()
    return {"success": True, "status": status}


@router.post("/packets/inject")
async def inject_direwolf_packet(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Inject a raw KISS hex frame or structured AX.25 packet into the Direwolf telemetry stream."""
    kiss_hex = payload.get("kiss_hex") or payload.get("kissHex")
    source_tag = str(payload.get("source_tag") or payload.get("sourceTransport") or "api_inject")

    try:
        if kiss_hex and isinstance(kiss_hex, str):
            cleaned = kiss_hex.strip().replace(" ", "").replace("0x", "").replace("\n", "")
            raw_bytes = bytes.fromhex(cleaned)
            packets = await service.ingest_raw_kiss_bytes(raw_bytes, source_tag=source_tag)
            return {"success": True, "count": len(packets), "packets": packets}

        source = str(payload.get("source") or payload.get("sourceCallsign") or "").strip()
        destination = str(
            payload.get("destination") or payload.get("destinationCallsign") or "CQ"
        ).strip()
        if not source:
            raise HTTPException(
                status_code=400,
                detail="Provide either 'kiss_hex' or structured 'source' and payload fields",
            )

        raw_digis = payload.get("digipeaters") or []
        if isinstance(raw_digis, str):
            digipeaters = [d.strip() for d in raw_digis.split(",") if d.strip()]
        else:
            digipeaters = [str(d).strip() for d in raw_digis if str(d).strip()]

        channel = int(payload.get("channel", 0))
        payload_hex = payload.get("payload_hex") or payload.get("payloadHex")
        payload_ascii = (
            payload.get("payload_ascii")
            or payload.get("payloadAscii")
            or payload.get("payload")
            or ""
        )

        if payload_hex and isinstance(payload_hex, str):
            cleaned_phex = payload_hex.strip().replace(" ", "").replace("0x", "")
            info_bytes: bytes | str = bytes.fromhex(cleaned_phex)
        else:
            info_bytes = str(payload_ascii)

        packet = await service.ingest_structured_packet(
            source=source,
            destination=destination,
            digipeaters=digipeaters,
            payload=info_bytes,
            channel=channel,
            source_tag=source_tag,
        )
        return {"success": True, "count": 1, "packets": [packet]}
    except (KISSFrameError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/simulate/presets")
async def simulate_satellite_presets() -> dict[str, Any]:
    """Inject the 3 realistic satellite telemetry packets (LAPAN-A2/IO-86, ISS, CubeSat 9600 bps)."""
    packets = await service.inject_satellite_presets()
    return {
        "success": True,
        "count": len(packets),
        "packets": packets,
        "status": service.get_status_dict(),
    }


@router.get("/devices")
async def get_direwolf_server_devices() -> dict[str, Any]:
    """Return server-side audio input devices and serial COM ports (COM3 rigctld / COM4 audio)."""
    return service.discover_server_devices()


@router.post("/config")
async def update_direwolf_server_config(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Update server-side Icom IC-9700 port mapping (e.g., COM3 for rigctld, COM4 for audio)."""
    status = await service.update_server_config(
        rigctld_com_port=payload.get("rigctld_com_port") or payload.get("rigctldComPort"),
        audio_com_port=payload.get("audio_com_port") or payload.get("audioComPort"),
        device_id=payload.get("device_id") or payload.get("deviceId"),
        input_source_mode=payload.get("input_source_mode") or payload.get("inputSourceMode"),
    )
    return {"success": True, "status": status}


@router.post("/audio/start")
async def start_direwolf_server_audio(
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    """Start capturing audio from the Server Icom IC-9700 (COM4 / USB Audio CODEC) and stream to UI."""
    status = await service.start_server_audio_stream(
        device_id=payload.get("device_id") or payload.get("deviceId"),
        rigctld_com_port=payload.get("rigctld_com_port") or payload.get("rigctldComPort"),
        audio_com_port=payload.get("audio_com_port") or payload.get("audioComPort"),
        sample_rate=int(payload.get("sample_rate") or payload.get("sampleRate") or 48000),
    )
    return {"success": True, "status": status}


@router.post("/audio/stop")
async def stop_direwolf_server_audio() -> dict[str, Any]:
    """Stop server-side Icom IC-9700 audio stream."""
    status = await service.stop_server_audio_stream()
    return {"success": True, "status": status}
