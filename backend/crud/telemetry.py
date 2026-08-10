# CRUD operations for satellite TT&C telemetry storage and retrieval.

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import SatelliteTelemetry

logger = logging.getLogger("crud-telemetry")


async def save_telemetry_points(
    session: AsyncSession,
    satellite_id: str,
    points: List[Dict[str, Any]],
    timestamp: Optional[datetime] = None,
    raw_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Saves a batch of metric key/value pairs for a satellite.
    """
    try:
        ts = timestamp or datetime.now(timezone.utc)
        saved_records = []
        for pt in points:
            key = pt.get("metric_key") or pt.get("key")
            val = pt.get("value")
            unit = pt.get("unit")
            if key is not None and val is not None:
                record = SatelliteTelemetry(
                    satellite_id=str(satellite_id),
                    timestamp=ts,
                    metric_key=str(key),
                    numeric_value=float(val),
                    unit=str(unit) if unit else None,
                    raw_payload=raw_payload,
                )
                session.add(record)
                saved_records.append(record)

        await session.commit()
        return {
            "success": True,
            "saved_count": len(saved_records),
            "error": None,
        }
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to save telemetry points for {satellite_id}: {e}")
        return {"success": False, "saved_count": 0, "error": str(e)}


async def get_telemetry_history(
    session: AsyncSession,
    satellite_id: str,
    metric_keys: Optional[List[str]] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 1000,
) -> Dict[str, Any]:
    """
    Retrieves time-series history for the specified satellite and metric keys.
    """
    try:
        stmt = select(SatelliteTelemetry).where(
            SatelliteTelemetry.satellite_id == str(satellite_id)
        )
        if metric_keys:
            stmt = stmt.where(SatelliteTelemetry.metric_key.in_(metric_keys))
        if start_time:
            stmt = stmt.where(SatelliteTelemetry.timestamp >= start_time)
        if end_time:
            stmt = stmt.where(SatelliteTelemetry.timestamp <= end_time)

        stmt = stmt.order_by(desc(SatelliteTelemetry.timestamp)).limit(limit)

        result = await session.execute(stmt)
        records = result.scalars().all()

        data = [
            {
                "id": str(r.id),
                "satellite_id": r.satellite_id,
                "timestamp": r.timestamp.isoformat(),
                "metric_key": r.metric_key,
                "value": r.numeric_value,
                "unit": r.unit,
                "raw_payload": r.raw_payload,
            }
            for r in reversed(records)
        ]

        return {"success": True, "data": data, "error": None}
    except Exception as e:
        logger.error(f"Failed to fetch telemetry history for {satellite_id}: {e}")
        return {"success": False, "data": [], "error": str(e)}


async def get_latest_telemetry(
    session: AsyncSession,
    satellite_id: str
) -> Dict[str, Any]:
    """
    Retrieves the most recent metric values for each key for a satellite.
    """
    try:
        stmt = (
            select(SatelliteTelemetry)
            .where(SatelliteTelemetry.satellite_id == str(satellite_id))
            .order_by(desc(SatelliteTelemetry.timestamp))
            .limit(200)
        )

        result = await session.execute(stmt)
        records = result.scalars().all()

        latest_map: Dict[str, Dict[str, Any]] = {}
        for r in records:
            if r.metric_key not in latest_map:
                latest_map[r.metric_key] = {
                    "metric_key": r.metric_key,
                    "value": r.numeric_value,
                    "unit": r.unit,
                    "timestamp": r.timestamp.isoformat(),
                }

        return {"success": True, "data": latest_map, "error": None}
    except Exception as e:
        logger.error(f"Failed to fetch latest telemetry for {satellite_id}: {e}")
        return {"success": False, "data": {}, "error": str(e)}
