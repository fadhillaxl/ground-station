# Spawns and manages SatDump live decoding subprocesses.

import asyncio
import logging
import socket
from typing import Dict, Any, Optional
from pathlib import Path

from weather.pipelines import gk2a

logger = logging.getLogger("weather-manager")

# Dictionary to hold the active SatDump processes
# Key: decoder_id (usually the observation ID or a string), Value: dict of process info
active_processes: Dict[str, Dict[str, Any]] = {}


def find_free_port() -> int:
    """Finds an available local TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def map_sdr_config_to_args(sdr_config: Dict[str, Any]) -> list[str]:
    """
    Maps Ground Station SDR configuration dictionary to SatDump CLI source options.
    """
    sdr_type = sdr_config.get("type", "rtlsdrusbv3")
    if isinstance(sdr_type, str):
        sdr_type = sdr_type.lower()
    else:
        # If it's an Enum object, get its value
        sdr_type = getattr(sdr_type, "value", "rtlsdrusbv3").lower()

    connection_type = sdr_config.get("connection_type")
    if not connection_type:
        if "tcp" in sdr_type:
            connection_type = "tcp"
        else:
            connection_type = "usb"

    gain = sdr_config.get("gain", 40.0)
    bias_t = sdr_config.get("bias_t", False) or sdr_config.get("bias", False)
    lna_agc = sdr_config.get("lna_agc", False)

    args = []

    # Detect device type
    if "rtlsdr" in sdr_type:
        if connection_type == "tcp":
            args.extend([
                "--source", "rtltcp",
                "--ip_address", str(sdr_config.get("host", "127.0.0.1")),
                "--port", str(sdr_config.get("port", 1234)),
            ])
        else:
            args.extend(["--source", "rtlsdr"])
        
        args.extend(["--gain", str(gain)])
        if lna_agc:
            args.append("--lna_agc")
        if bias_t:
            args.append("--bias")

    elif "airspy" in sdr_type:
        args.extend(["--source", "airspy"])
        # Airspy uses manual or general gain depending on settings
        args.extend(["--general_gain", str(int(gain / 2))])
        if bias_t:
            args.append("--bias")

    elif "soapysdr" in sdr_type:
        args.extend(["--source", "soapysdr"])
        # For remote SoapySDR, add specific address properties if required
        if sdr_config.get("host"):
            args.extend(["--device", f"remote={sdr_config.get('host')}"])
    else:
        # Default fallback
        args.extend(["--source", "rtlsdr", "--gain", str(gain)])

    return args


async def start_live_decoder(
    decoder_id: str,
    pipeline_id: str,
    sdr_config: Dict[str, Any],
    output_dir: str,
    frequency_hz: Optional[float] = None,
    sample_rate: Optional[float] = None
) -> Optional[int]:
    """
    Spawns a SatDump live subprocess for the given pipeline and SDR configuration.

    Args:
        decoder_id: A unique ID to track the process.
        pipeline_id: The pipeline identifier (e.g. 'gk2a_lrit', 'gk2a_hrit').
        sdr_config: The SDR configuration dictionary.
        output_dir: Directory where SatDump should store decoded output.
        frequency_hz: Override target frequency (optional).
        sample_rate: Override sample rate (optional).

    Returns:
        The assigned HTTP port of the SatDump webserver, or None if starting failed.
    """
    if decoder_id in active_processes:
        logger.warning(f"Live decoder {decoder_id} is already running.")
        return active_processes[decoder_id]["port"]

    # Retrieve pipeline config
    pipeline_info = gk2a.PIPELINES.get(pipeline_id)
    if not pipeline_info:
        logger.error(f"Unknown weather pipeline: {pipeline_id}")
        return None

    # Determine runtime parameters
    target_freq = frequency_hz or pipeline_info["frequency_hz"]
    target_rate = sample_rate or sdr_config.get("sample_rate", 2.048e6)
    satdump_pipeline = pipeline_info["satdump_pipeline"]

    # Setup paths
    backend_dir = Path(__file__).parent.parent
    resolved_output = Path(output_dir)
    if not resolved_output.is_absolute():
        resolved_output = backend_dir / "data" / output_dir.lstrip("/")
    
    resolved_output.mkdir(parents=True, exist_ok=True)

    # Find free port for HTTP Server monitoring
    http_port = find_free_port()
    http_addr = f"127.0.0.1:{http_port}"

    # Build command line arguments
    # satdump live <pipeline> <out_dir> --source <src> [args] --samplerate <sr> --frequency <freq> --http_server <addr>
    cmd = [
        "satdump",
        "live",
        satdump_pipeline,
        str(resolved_output),
    ]

    # Add source arguments
    source_args = map_sdr_config_to_args(sdr_config)
    cmd.extend(source_args)

    # Add general parameters
    cmd.extend([
        "--frequency", f"{target_freq:.6e}" if isinstance(target_freq, float) else str(target_freq),
        "--samplerate", f"{target_rate:.6e}" if isinstance(target_rate, float) else str(target_rate),
        "--http_server", http_addr,
        "--dc_block"
    ])

    logger.info(f"Launching SatDump command: {' '.join(cmd)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        active_processes[decoder_id] = {
            "process": process,
            "port": http_port,
            "pipeline_id": pipeline_id,
            "output_dir": str(resolved_output),
            "stdout_task": asyncio.create_task(_log_output(decoder_id, process.stdout, "stdout")),
            "stderr_task": asyncio.create_task(_log_output(decoder_id, process.stderr, "stderr")),
            "logs": [],
        }

        logger.info(f"SatDump process started with PID {process.pid} on HTTP port {http_port}")
        return http_port

    except Exception as e:
        logger.error(f"Failed to launch SatDump live decoder: {e}")
        return None


async def stop_live_decoder(decoder_id: str) -> bool:
    """Stops an active SatDump live decoder subprocess."""
    proc_info = active_processes.get(decoder_id)
    if not proc_info:
        logger.warning(f"No active decoder found for ID {decoder_id}")
        return False

    process = proc_info["process"]
    logger.info(f"Stopping live decoder {decoder_id} (PID {process.pid})")

    # Terminate process group or process politely
    try:
        process.terminate()
        # Wait up to 5 seconds for termination
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutExpired:
            logger.warning(f"Process {process.pid} did not exit gracefully, killing...")
            process.kill()
            await process.wait()
    except Exception as e:
        logger.error(f"Error terminating SatDump process {process.pid}: {e}")

    # Cancel logger tasks
    proc_info["stdout_task"].cancel()
    proc_info["stderr_task"].cancel()

    del active_processes[decoder_id]
    logger.info(f"Decoder {decoder_id} stopped and cleaned up.")
    return True


import time

async def _log_output(decoder_id: str, stream: asyncio.StreamReader, name: str):
    """Utility to read output from SatDump stream and print to logs."""
    try:
        while True:
            line = await stream.readline()
            if not line:
                break
            line_decoded = line.decode('utf-8', errors='ignore').rstrip()
            if line_decoded:
                # Log debug info from SatDump
                logger.debug(f"[SatDump-{decoder_id}-{name}] {line_decoded}")
                
                # Cache logs for newly connected clients
                if decoder_id in active_processes:
                    proc_logs = active_processes[decoder_id].setdefault("logs", [])
                    proc_logs.append({
                        "stream": name,
                        "message": line_decoded,
                        "timestamp": time.time()
                    })
                    if len(proc_logs) > 500:
                        proc_logs.pop(0)

                # Emit websocket event
                from weather.websocket import emit_weather_event
                await emit_weather_event("weather.log", {
                    "decoder_id": decoder_id,
                    "stream": name,
                    "message": line_decoded,
                    "timestamp": time.time()
                })
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error reading stream {name} for decoder {decoder_id}: {e}")


def get_decoder_logs(decoder_id: str) -> list[Dict[str, Any]]:
    """Returns the cached logs for the given active decoder."""
    proc_info = active_processes.get(decoder_id)
    if proc_info:
        return proc_info.get("logs", [])
    return []
