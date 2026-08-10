# Handlers and endpoints for TT&C telemetry data ingestion, history, and SatNOGS schemas.

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Request, HTTPException, Query, Body

import crud.telemetry as crud_telemetry
from db import AsyncSessionLocal
from telemetry.schemaparser import evaluate_metric_math, parse_satnogs_grafana_schema

logger = logging.getLogger("handlers-telemetry")

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Global socket.io instance reference
_sio_instance = None


def set_telemetry_socketio(sio_app: Any):
    global _sio_instance
    _sio_instance = sio_app


async def emit_telemetry_live_event(satellite_id: str, data: Dict[str, Any]):
    """Emits Socket.IO live telemetry updates to connected clients."""
    if _sio_instance:
        try:
            await _sio_instance.emit(
                "telemetry-live",
                {
                    "satellite_id": str(satellite_id),
                    "data": data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
        except Exception as e:
            logger.error(f"Error emitting telemetry-live event: {e}")


@router.get("/{satellite_id}/history")
async def get_telemetry_history(
    satellite_id: str,
    metric_keys: Optional[str] = Query(None, description="Comma-separated metric keys"),
    limit: int = Query(500, ge=1, le=5000),
):
    """Returns time-series telemetry points for a satellite."""
    keys_list = [k.strip() for k in metric_keys.split(",")] if metric_keys else None
    async with AsyncSessionLocal() as session:
        res = await crud_telemetry.get_telemetry_history(
            session=session,
            satellite_id=satellite_id,
            metric_keys=keys_list,
            limit=limit,
        )
        if not res["success"]:
            raise HTTPException(status_code=500, detail=res["error"])
        return res


@router.get("/{satellite_id}/latest")
async def get_latest_telemetry(satellite_id: str):
    """Returns current health metric values for a satellite."""
    async with AsyncSessionLocal() as session:
        res = await crud_telemetry.get_latest_telemetry(
            session=session,
            satellite_id=satellite_id,
        )
        if not res["success"]:
            raise HTTPException(status_code=500, detail=res["error"])
        return res


@router.post("/{satellite_id}/ingest")
async def ingest_telemetry(
    satellite_id: str,
    payload: Dict[str, Any] = Body(...),
):
    """Ingests a telemetry packet / metric points batch for a satellite."""
    points = payload.get("points", [])
    raw_payload = payload.get("raw_payload") or payload

    if not points and isinstance(payload.get("metrics"), dict):
        points = [
            {"metric_key": k, "value": v}
            for k, v in payload["metrics"].items()
        ]

    if not points:
        raise HTTPException(status_code=400, detail="No metric points found in payload.")

    async with AsyncSessionLocal() as session:
        res = await crud_telemetry.save_telemetry_points(
            session=session,
            satellite_id=satellite_id,
            points=points,
            raw_payload=raw_payload,
        )
        if not res["success"]:
            raise HTTPException(status_code=500, detail=res["error"])

    # Broadcast live event
    await emit_telemetry_live_event(satellite_id, {"points": points, "raw": raw_payload})

    return {"success": True, "saved_count": res["saved_count"]}


@router.post("/import-schema")
async def import_satnogs_schema(
    payload: Dict[str, Any] = Body(...),
):
    """Parses and imports a SatNOGS Grafana dashboard JSON schema."""
    try:
        parsed = parse_satnogs_grafana_schema(payload)
        return {"success": True, "data": parsed}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse SatNOGS schema: {e}")
