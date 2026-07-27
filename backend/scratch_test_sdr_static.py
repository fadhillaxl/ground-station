import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.abspath("backend"))

from weather.manager import map_sdr_config_to_args

sdr_config = {
    "id": "315202c6019a4c92a03faf38ad9ee8d0",
    "name": "TCP SDR v4",
    "type": "RTLSDRTCPV4",
    "host": "172.26.216.190",
    "port": 1234,
    "gain": 49.0,
    "bias_t": True,
    "lna_agc": True,
    "antenna_port": "RX",
    "sample_rate": 2048000.0,
}

args = map_sdr_config_to_args(sdr_config)
print("Mapped arguments:", args)
