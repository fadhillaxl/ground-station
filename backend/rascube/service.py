"""Singleton service managing RASCube state, telemetry history, camera assembly, and Socket.IO emission."""

from __future__ import annotations

import base64
import collections
import logging
import threading
import time
from typing import Any, Optional

from rascube.camera import CameraAssembler, parse_camera_frame_bytes
from rascube.decoder import decode_telemetry_to_dict
from rascube.models import RascubeStatus

logger = logging.getLogger("rascube-service")


class RascubeService:
    """Central service managing RASCube hardware state and data streams."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._camera_lock = threading.Lock()

        # Status
        self._status = RascubeStatus()

        # Telemetry storage
        self._latest_sample: Optional[dict[str, Any]] = None
        self._history: collections.deque[dict[str, Any]] = collections.deque(maxlen=200)

        # Camera storage
        self._camera_assembler = CameraAssembler()
        self._camera_chunks: list[dict[str, Any]] = []
        self._latest_image: Optional[bytes] = None
        self._latest_image_metadata: Optional[dict[str, Any]] = None
        self._partial_image: Optional[bytes] = None
        self._camera_progress: dict[str, Any] = {
            "blocks_received": 0,
            "total_bytes": 0,
            "started_at": None,
            "elapsed_seconds": 0.0,
            "transfer_speed_bps": 0.0,
            "latest_block_index": 0,
            "error": None,
        }

        # Socket.IO instance
        self._sio: Any = None

    def set_socketio(self, sio: Any) -> None:
        """Register Socket.IO instance for real-time broadcasts."""
        self._sio = sio

    async def _emit(self, event: str, data: Any) -> None:
        """Asynchronously emit Socket.IO event if sio instance exists."""
        if self._sio:
            try:
                await self._sio.emit(event, data)
            except Exception as exc:
                logger.debug(f"Failed to emit socketio event {event}: {exc}")

    def get_status_dict(self) -> dict[str, Any]:
        """Return status representation as dictionary."""
        with self._lock:
            return {
                "is_connected": self._status.is_connected,
                "mode": self._status.mode,
                "connected_port": self._status.connected_port,
                "serial_number": self._status.serial_number,
                "total_samples_received": self._status.total_samples_received,
                "last_received_time": self._status.last_received_time,
                "camera_status": self._status.camera_status,
                "error_message": self._status.error_message,
            }

    async def update_status(
        self,
        is_connected: bool,
        serial_number: Optional[int] = None,
        source: str = "client_web_serial",
    ) -> dict[str, Any]:
        """Update connection status from client browser."""
        with self._lock:
            self._status.is_connected = is_connected
            if serial_number is not None:
                self._status.serial_number = serial_number
            self._status.connected_port = (
                "Client Web USB/Serial (Browser)" if is_connected else None
            )
            self._status.error_message = None

        status_dict = self.get_status_dict()
        await self._emit("rascube-status", status_dict)
        return status_dict

    async def ingest_telemetry(
        self, hex_data: str, source: str = "client_web_serial"
    ) -> dict[str, Any]:
        """Decode and ingest telemetry packet."""
        decoded = decode_telemetry_to_dict(hex_data, source=source)
        now = time.time()

        with self._lock:
            self._status.is_connected = True
            self._status.total_samples_received += 1
            self._status.last_received_time = now
            self._latest_sample = decoded
            self._history.append(decoded)

        await self._emit("rascube-telemetry", decoded)
        return decoded

    async def ingest_camera_chunk(
        self, hex_data: str, source: str = "client_web_serial"
    ) -> dict[str, Any]:
        """Ingest raw camera block, update progressive JPEG and progress metrics."""
        cleaned = hex_data.strip().replace(" ", "").replace("0x", "")
        raw_bytes = bytes.fromhex(cleaned)
        block = parse_camera_frame_bytes(raw_bytes)

        now = time.time()
        chunk_record: dict[str, Any] = {}

        with self._camera_lock:
            full_jpeg = self._camera_assembler.add(block)
            started_at = self._camera_progress.get("started_at") or now
            elapsed = round(max(0.001, now - started_at), 2)

            self._camera_progress["blocks_received"] += 1
            self._camera_progress["total_bytes"] += len(block.data)
            self._camera_progress["elapsed_seconds"] = elapsed
            self._camera_progress["latest_block_index"] = block.index
            speed = round(self._camera_progress["total_bytes"] / max(0.01, elapsed), 1)
            self._camera_progress["transfer_speed_bps"] = speed

            # Build partial JPEG preview if available
            partial_jpeg = self._camera_assembler.get_partial_jpeg()
            partial_b64 = base64.b64encode(partial_jpeg).decode("ascii") if partial_jpeg else None
            self._partial_image = partial_jpeg

            chunk_record = {
                "type": "camera_chunk",
                "index": block.index,
                "size": len(block.data),
                "total_blocks": self._camera_progress["blocks_received"],
                "total_bytes": self._camera_progress["total_bytes"],
                "elapsed_seconds": elapsed,
                "hex_preview": block.data[:16].hex().upper(),
                "partial_jpeg_base64": partial_b64,
                "timestamp": now,
            }
            self._camera_chunks.append(chunk_record)

            if full_jpeg is not None:
                self._latest_image = full_jpeg
                self._latest_image_metadata = {
                    "block_count": self._camera_assembler.block_count,
                    "duplicate_blocks": len(self._camera_assembler.duplicates),
                    "byte_length": len(full_jpeg),
                    "captured_at": now,
                    "capture_duration_seconds": elapsed,
                }
                with self._lock:
                    self._status.camera_status = "completed"

        await self._emit("rascube-camera-chunk", chunk_record)
        return chunk_record

    def start_camera_capture(
        self, timeout: float = 35.0, source: str = "client_web_serial"
    ) -> dict[str, Any]:
        """Reset camera state and begin capture session."""
        with self._camera_lock:
            with self._lock:
                self._status.camera_status = "capturing"
            self._camera_assembler.reset()
            self._camera_chunks.clear()
            self._partial_image = None
            self._camera_progress = {
                "blocks_received": 0,
                "total_bytes": 0,
                "started_at": time.time(),
                "elapsed_seconds": 0.0,
                "transfer_speed_bps": 0.0,
                "latest_block_index": 0,
                "error": None,
            }

        # Guard thread for timeout
        def _timeout_watcher() -> None:
            time.sleep(timeout)
            with self._camera_lock:
                with self._lock:
                    if self._status.camera_status == "capturing":
                        self._status.camera_status = "failed"
                        self._camera_progress["error"] = (
                            f"Camera capture timed out after {timeout:.1f}s"
                        )

        threading.Thread(target=_timeout_watcher, daemon=True, name="rascube-cam-timeout").start()
        return {"status": "capturing", "timeout": timeout}

    def get_camera_status(self) -> dict[str, Any]:
        """Get current camera progress, status, and chunk history."""
        with self._camera_lock:
            with self._lock:
                cam_status = self._status.camera_status
            return {
                "status": cam_status,
                "progress": dict(self._camera_progress),
                "chunks": list(self._camera_chunks[-100:]),
                "has_image": self._latest_image is not None,
                "metadata": self._latest_image_metadata,
                "image_url": "/api/rascube/camera/latest.jpg" if self._latest_image else None,
            }

    def get_latest_image_b64(self) -> Optional[dict[str, Any]]:
        """Return completed image in base64 format."""
        with self._camera_lock:
            if not self._latest_image:
                return None
            return {
                "metadata": self._latest_image_metadata,
                "image_url": "/api/rascube/camera/latest.jpg",
                "jpeg_base64": base64.b64encode(self._latest_image).decode("ascii"),
            }

    def get_latest_image_bytes(self) -> Optional[bytes]:
        """Return completed or partial JPEG bytes."""
        with self._camera_lock:
            return self._latest_image or self._partial_image

    def get_latest_telemetry(self) -> Optional[dict[str, Any]]:
        """Return the most recently received telemetry sample."""
        with self._lock:
            return self._latest_sample

    def get_telemetry_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return history buffer of telemetry samples."""
        with self._lock:
            return list(self._history)[-limit:]


# Global singleton instance
service = RascubeService()
