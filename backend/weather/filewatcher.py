# Periodically watches SatDump output directory for progressive image updates.

import asyncio
import logging
import base64
from io import BytesIO
from pathlib import Path
from typing import Dict, Any
from PIL import Image

from weather.websocket import emit_weather_event

logger = logging.getLogger("weather-filewatcher")

# Active directory watcher tasks: Key: decoder_id, Value: asyncio.Task
active_watcher_tasks: Dict[str, asyncio.Task] = {}


async def start_watcher_task(decoder_id: str, output_dir: str):
    """Starts the background directory file watcher task."""
    if decoder_id in active_watcher_tasks:
        logger.warning(f"Watcher task for {decoder_id} is already running.")
        return

    task = asyncio.create_task(_watcher_loop(decoder_id, Path(output_dir)))
    active_watcher_tasks[decoder_id] = task
    logger.info(f"Started image file watcher task for decoder {decoder_id} on directory {output_dir}")


async def stop_watcher_task(decoder_id: str):
    """Stops the active file watcher task."""
    task = active_watcher_tasks.get(decoder_id)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        del active_watcher_tasks[decoder_id]
        logger.info(f"Stopped image file watcher task for decoder {decoder_id}")


async def _watcher_loop(decoder_id: str, output_path: Path, scan_interval: float = 0.5):
    """Periodically scans output directory and emits new rows from modified images."""
    # Keeps track of last read height for each image file.
    # Key: file_path (str), Value: height (int)
    image_states: Dict[str, int] = {}

    while True:
        try:
            if not output_path.exists():
                await asyncio.sleep(1.0)
                continue

            # Look for image files recursively (.png, .jpg, .jpeg)
            image_files = []
            for ext in ("*.png", "*.jpg", "*.jpeg"):
                image_files.extend(list(output_path.rglob(ext)))

            for file_path in image_files:
                file_str = str(file_path)
                last_height = image_states.get(file_str, 0)

                try:
                    # Open image using Pillow
                    with Image.open(file_path) as img:
                        img.load()  # Load image data into memory to close lock
                        
                        width, height = img.size
                        
                        if height > last_height:
                            # Extract the new portion
                            crop_box = (0, last_height, width, height)
                            new_portion = img.crop(crop_box)
                            
                            # Convert to JPEG bytes
                            buffer = BytesIO()
                            new_portion.save(buffer, format="JPEG", quality=85)
                            base64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")
                            
                            # Emit Socket.IO message via default namespace
                            await emit_weather_event(
                                "weather_image_update",
                                {
                                    "decoder_id": decoder_id,
                                    "filename": file_path.name,
                                    "width": width,
                                    "height": height - last_height,
                                    "y_offset": last_height,
                                    "total_height": height,
                                    "data": base64_data
                                }
                            )
                            
                            # Update stored height
                            image_states[file_str] = height
                            logger.info(f"Emitted {height - last_height} new rows for {file_path.name}")
                            
                except OSError:
                    # File is probably locked or currently written to, skip and retry next scan
                    continue
                except Exception as e:
                    logger.debug(f"Error scanning image file {file_path.name}: {e}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in file watcher loop: {e}")

        # Scan folder based on scan_interval
        await asyncio.sleep(scan_interval)
