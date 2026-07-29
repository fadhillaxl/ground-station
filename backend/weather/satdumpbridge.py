# Connects to running SatDump HTTP instances and polls live telemetry/lock state.

import asyncio
import logging
import httpx
import random
import math
from typing import Dict, Any, Optional

from weather import manager
from weather.pipelines import gk2a
from weather.websocket import emit_weather_event

logger = logging.getLogger("weather-bridge")

# Active bridge polling tasks: Key: decoder_id, Value: asyncio.Task
active_bridge_tasks: Dict[str, asyncio.Task] = {}


def generate_constellation_points(demod_type: str, snr_db: float, num_points: int = 150) -> list[list[float]]:
    """
    Synthesizes a realistic constellation diagram (I/Q points) based on
    the current demodulator type and signal-to-noise ratio (SNR).
    """
    points = []
    
    # Cap SNR to reasonable limits for noise math
    snr_db = max(-5.0, min(snr_db, 30.0))
    # Calculate noise standard deviation from SNR (linear)
    # SNR = 10 * log10(Signal_Power / Noise_Power)
    # Assume Signal Power = 1.0 (normalized amplitude)
    noise_power = 10.0 ** (-snr_db / 10.0)
    noise_std = math.sqrt(noise_power)

    # Base target vectors
    if demod_type == "bpsk":
        targets = [(-1.0, 0.0), (1.0, 0.0)]
    elif demod_type == "qpsk":
        # 4 quadrants normalized amplitude
        targets = [(-0.707, -0.707), (-0.707, 0.707), (0.707, -0.707), (0.707, 0.707)]
    else:
        # Fallback BPSK
        targets = [(-1.0, 0.0), (1.0, 0.0)]

    for _ in range(num_points):
        target = random.choice(targets)
        # Add Gaussian noise
        i_noise = random.gauss(0, noise_std)
        q_noise = random.gauss(0, noise_std)
        points.append([target[0] + i_noise, target[1] + q_noise])

    return points


async def start_bridge_task(decoder_id: str, http_port: int, pipeline_id: str):
    """Starts the background task to poll SatDump HTTP server and stream telemetry."""
    if decoder_id in active_bridge_tasks:
        logger.warning(f"Bridge task for {decoder_id} is already running.")
        return

    pipeline_info = gk2a.PIPELINES.get(pipeline_id)
    demod_type = pipeline_info.get("demodulator", "bpsk") if pipeline_info else "bpsk"

    task = asyncio.create_task(_bridge_polling_loop(decoder_id, http_port, demod_type))
    active_bridge_tasks[decoder_id] = task
    logger.info(f"Started telemetry bridge task for decoder {decoder_id} on port {http_port}")


async def stop_bridge_task(decoder_id: str):
    """Stops the active bridge polling task."""
    task = active_bridge_tasks.get(decoder_id)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        del active_bridge_tasks[decoder_id]
        logger.info(f"Stopped telemetry bridge task for decoder {decoder_id}")


async def _bridge_polling_loop(decoder_id: str, http_port: int, demod_type: str):
    """Periodically queries SatDump API and broadcasts results via WebSocket."""
    url = f"http://127.0.0.1:{http_port}/api"
    
    # Standard fallback values
    last_signal_data = {
        "snr": 0.0,
        "peak_snr": 0.0,
        "freq_offset": 0.0,
        "viterbi_lock": False,
        "deframer_lock": False,
        "rs_errors": 0,
        "ber": 0.0,
        "constellation": []
    }

    async with httpx.AsyncClient(timeout=1.0) as client:
        while True:
            try:
                # Query SatDump status API
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if not isinstance(data, dict):
                        # SatDump API returned null or a non-object during initialization, skip
                        data = {}
                    
                    # Extract variables from SatDump JSON output
                    demod_block = data.get("psk_demod") or {}
                    
                    # Look for decoder blocks dynamically
                    decoder_block = {}
                    for key, val in data.items():
                        if ("decoder" in key or "deframer" in key) and val is not None:
                            decoder_block = val
                            break
                    
                    # Extract SNR (sometimes it's reported as linear or directly in dB)
                    raw_snr = float(demod_block.get("snr", 0.0)) if demod_block else 0.0
                    # SatDump linear SNR to dB conversion logic if necessary,
                    # or SatDump might return dB. We check if raw_snr > 0:
                    snr_db = raw_snr
                    if raw_snr > 0.0 and raw_snr < 1.0:
                        # If SNR is fractional power, convert to dB
                        snr_db = 10.0 * math.log10(raw_snr / (1.0 - raw_snr + 1e-6))
                    
                    freq_offset = float(demod_block.get("freq", 0.0)) if demod_block else 0.0
                    peak_snr = float(demod_block.get("peak_snr", 0.0)) if demod_block else 0.0

                    # Decoder fields
                    viterbi_lock_val = decoder_block.get("viterbi_lock", 0) if decoder_block else 0
                    viterbi_lock = bool(viterbi_lock_val) or (decoder_block.get("deframer_lock", False) if decoder_block else False)
                    deframer_lock = decoder_block.get("deframer_lock", False) if decoder_block else False
                    rs_errors = int(decoder_block.get("rs_avg", 0)) if decoder_block else 0
                    ber = float(decoder_block.get("viterbi_ber", 0.0)) if decoder_block else 0.0

                    # Synthesize constellation points for UI rendering
                    constellation = generate_constellation_points(demod_type, snr_db)

                    last_signal_data = {
                        "snr": round(snr_db, 2),
                        "peak_snr": round(peak_snr, 2),
                        "freq_offset": round(freq_offset, 2),
                        "viterbi_lock": viterbi_lock,
                        "deframer_lock": deframer_lock,
                        "rs_errors": rs_errors,
                        "ber": ber,
                        "constellation": constellation
                    }
                else:
                    logger.warning(f"SatDump server returned status code {response.status_code}")
            
            except httpx.RequestError as e:
                # Silently catch request errors (e.g. server is starting up or shut down)
                logger.debug(f"Telemetry bridge request error: {e}")
            except Exception as e:
                raw_text = response.text if 'response' in locals() else 'No response'
                logger.error(f"Error parsing SatDump telemetry: {e}. Raw response: {raw_text}")

            # Emit packet to frontend via Socket.IO default namespace
            await emit_weather_event(
                "weather_signal",
                {
                    "decoder_id": decoder_id,
                    "data": last_signal_data
                }
            )

            # Polling frequency interval: 350ms
            await asyncio.sleep(0.35)
