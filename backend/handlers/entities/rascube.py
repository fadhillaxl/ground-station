"""FastAPI router and endpoints for RASCube Client Web USB / Serial telemetry, camera, and commands."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Response

from rascube.decoder import ProtocolDecodeError, decode_telemetry_to_dict
from rascube.service import service

logger = logging.getLogger("handlers-rascube")

router = APIRouter(prefix="/api/rascube", tags=["rascube"])


def set_rascube_socketio(sio_app: Any) -> None:
    """Register Socket.IO instance for RASCube realtime broadcasting."""
    service.set_socketio(sio_app)


@router.get("/status")
async def get_rascube_status() -> dict[str, Any]:
    """Returns client Web Serial connection status, satellite ID, and camera state."""
    return service.get_status_dict()


@router.post("/status")
async def update_rascube_status(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Announces client browser Web Serial connection or disconnection."""
    is_connected = bool(payload.get("is_connected", True))
    serial_number = payload.get("serial_number")
    source = str(payload.get("source", "client_web_serial"))
    return await service.update_status(
        is_connected=is_connected,
        serial_number=int(serial_number) if serial_number is not None else None,
        source=source,
    )


@router.post("/telemetry/ingest")
async def ingest_telemetry(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Ingest raw hex telemetry frame received by browser via Web Serial."""
    hex_data = payload.get("hex") or payload.get("payload")
    if not hex_data or not isinstance(hex_data, str):
        raise HTTPException(status_code=400, detail="Missing 'hex' in request body")

    source = str(payload.get("source", "client_web_serial"))
    try:
        decoded = await service.ingest_telemetry(hex_data, source=source)
        return {"status": "ingested", "telemetry": decoded}
    except (ProtocolDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/telemetry/latest")
async def get_latest_telemetry() -> dict[str, Any]:
    """Returns the most recently decoded telemetry packet."""
    sample = service.get_latest_telemetry()
    if sample is None:
        raise HTTPException(status_code=503, detail="No telemetry data received yet.")
    return sample


@router.get("/telemetry/history")
async def get_telemetry_history(
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Returns up to the last 200 telemetry samples."""
    items = service.get_telemetry_history(limit=limit)
    return {"count": len(items), "samples": items}


@router.post("/camera/capture")
async def trigger_camera_capture(
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    """Signals backend that a camera capture session is starting."""
    timeout = float(payload.get("timeout", 35.0))
    source = str(payload.get("source", "client_web_serial"))
    return service.start_camera_capture(timeout=timeout, source=source)


@router.post("/camera/chunk/ingest")
async def ingest_camera_chunk(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Ingest 242-byte camera block from Web Serial, update progressive JPEG, and broadcast."""
    hex_data = payload.get("hex") or payload.get("payload")
    if not hex_data or not isinstance(hex_data, str):
        raise HTTPException(status_code=400, detail="Missing 'hex' in request body")

    source = str(payload.get("source", "client_web_serial"))
    try:
        chunk_record = await service.ingest_camera_chunk(hex_data, source=source)
        return {"status": "camera_chunk_ingested", "chunk": chunk_record}
    except (ProtocolDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/camera/status")
async def get_camera_status() -> dict[str, Any]:
    """Returns current camera transfer status, total blocks received, and recent chunks."""
    return service.get_camera_status()


@router.get("/camera/latest")
async def get_latest_camera_image() -> dict[str, Any]:
    """Returns the latest completed camera image encoded in Base64 with metadata."""
    img = service.get_latest_image_b64()
    if img is None:
        raise HTTPException(status_code=404, detail="No camera image captured yet.")
    return img


@router.get("/camera/latest.jpg")
async def get_latest_camera_jpeg() -> Response:
    """Returns raw binary JPEG image (completed or partial preview)."""
    img_bytes = service.get_latest_image_bytes()
    if img_bytes is None:
        raise HTTPException(status_code=404, detail="No camera image available yet.")
    return Response(
        content=img_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/decode")
async def decode_hex_query(
    hex: str = Query(..., description="Raw hex telemetry string"),
) -> dict[str, Any]:
    """Decode raw hex telemetry string via query parameter."""
    try:
        return decode_telemetry_to_dict(hex)
    except (ProtocolDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/decode")
async def decode_hex_body(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Decode raw hex telemetry string via JSON body."""
    hex_str = payload.get("hex")
    if not hex_str or not isinstance(hex_str, str):
        raise HTTPException(status_code=400, detail="Missing 'hex' in request body")
    try:
        return decode_telemetry_to_dict(hex_str)
    except (ProtocolDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
