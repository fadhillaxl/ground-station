# Storage management for live decode weather folder.
# Enforces size limits (default 2GB) by pruning oldest files when limit is exceeded.

import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any, Union

logger = logging.getLogger("weather-cleaner")

DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB (2,147,483,648 bytes)
DEFAULT_TARGET_BYTES = int(DEFAULT_MAX_BYTES * 0.85)  # 1.7 GB (85% of limit)

# Active cleaner tasks: Key: decoder_id, Value: asyncio.Task
active_cleaner_tasks: Dict[str, asyncio.Task] = {}


def get_dir_size(folder_path: Path) -> int:
    """Recursively calculates total file size in bytes inside a directory."""
    total_size = 0
    if not folder_path.exists():
        return 0
    try:
        for entry in folder_path.rglob("*"):
            if entry.is_file() and not entry.is_symlink():
                try:
                    total_size += entry.stat().st_size
                except (OSError, FileNotFoundError):
                    pass
    except Exception as e:
        logger.error(f"Error calculating directory size for {folder_path}: {e}")
    return total_size


def cleanup_weather_folder(
    folder_path: Union[str, Path],
    max_bytes: int = DEFAULT_MAX_BYTES,
    target_bytes: int = DEFAULT_TARGET_BYTES
) -> Dict[str, Any]:
    """
    Checks total size of files in folder_path. If total size exceeds max_bytes,
    deletes oldest files (by mtime) until total size is at or below target_bytes.

    Returns summary of cleanup action.
    """
    path = Path(folder_path).resolve()
    if not path.exists() or not path.is_dir():
        return {"cleaned_bytes": 0, "deleted_files": 0, "current_size": 0}

    total_size = get_dir_size(path)
    if total_size <= max_bytes:
        return {"cleaned_bytes": 0, "deleted_files": 0, "current_size": total_size}

    logger.warning(
        f"Weather folder {path} size ({total_size / (1024**3):.2f} GB) "
        f"exceeds limit ({max_bytes / (1024**3):.2f} GB). Starting cleanup..."
    )

    # Collect file entries with mtime and size
    file_entries = []
    for entry in path.rglob("*"):
        if entry.is_file() and not entry.is_symlink():
            try:
                st = entry.stat()
                file_entries.append((st.st_mtime, st.st_size, entry))
            except (OSError, FileNotFoundError):
                pass

    # Sort files by modification time ascending (oldest first)
    file_entries.sort(key=lambda item: item[0])

    cleaned_bytes = 0
    deleted_files = 0
    current_size = total_size

    for mtime, fsize, file_path in file_entries:
        if current_size <= target_bytes:
            break
        try:
            file_path.unlink()
            current_size -= fsize
            cleaned_bytes += fsize
            deleted_files += 1
            logger.debug(f"Deleted old weather file: {file_path.name} ({fsize} bytes)")
        except (OSError, PermissionError, FileNotFoundError) as err:
            logger.warning(f"Could not delete file {file_path}: {err}")

    # Remove empty subdirectories
    for root, dirs, _ in os.walk(path, topdown=False):
        for dir_name in dirs:
            dir_path = Path(root) / dir_name
            try:
                if dir_path.is_dir() and not any(dir_path.iterdir()):
                    dir_path.rmdir()
            except (OSError, PermissionError):
                pass

    logger.info(
        f"Weather cleanup finished for {path}: deleted {deleted_files} files, "
        f"freed {cleaned_bytes / (1024**2):.2f} MB. New size: {current_size / (1024**3):.2f} GB."
    )

    return {
        "cleaned_bytes": cleaned_bytes,
        "deleted_files": deleted_files,
        "current_size": current_size,
    }


async def start_cleaner_task(decoder_id: str, output_dir: Union[str, Path], check_interval: float = 30.0):
    """Starts a background periodic storage cleaner task for a live weather decoder."""
    if decoder_id in active_cleaner_tasks:
        logger.warning(f"Cleaner task for {decoder_id} is already running.")
        return

    task = asyncio.create_task(_cleaner_loop(decoder_id, Path(output_dir), check_interval))
    active_cleaner_tasks[decoder_id] = task
    logger.info(f"Started weather storage cleaner task for decoder {decoder_id} on directory {output_dir}")


async def stop_cleaner_task(decoder_id: str):
    """Stops the active storage cleaner task."""
    task = active_cleaner_tasks.get(decoder_id)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        del active_cleaner_tasks[decoder_id]
        logger.info(f"Stopped weather storage cleaner task for decoder {decoder_id}")


async def _cleaner_loop(decoder_id: str, output_path: Path, check_interval: float):
    """Periodically checks and cleans weather directory during live decoding."""
    while True:
        try:
            await asyncio.to_thread(cleanup_weather_folder, output_path)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in weather cleaner loop for {decoder_id}: {e}")

        await asyncio.sleep(check_interval)
