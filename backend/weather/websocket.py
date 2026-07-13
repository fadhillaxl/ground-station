# Event emission logic for weather satellite live decoding over WebSocket.

import logging
from typing import Dict, Any

logger = logging.getLogger("weather-websocket")

# Global socketio instance (set by startup.py)
_sio = None


def set_socketio_instance(sio):
    """Set the global socketio instance for event emission."""
    global _sio
    _sio = sio
    logger.info("Socket.IO instance registered with weather-websocket")


async def emit_weather_event(event_name: str, payload: Dict[str, Any], namespace: str = "/"):
    """Emits a Socket.IO event to all clients on the given namespace."""
    if _sio:
        try:
            await _sio.emit(event_name, payload, namespace=namespace)
        except Exception as e:
            logger.error(f"Failed to emit weather socket event '{event_name}': {e}")
    else:
        logger.debug(f"Socket.IO not initialized, skipped emitting '{event_name}'")
