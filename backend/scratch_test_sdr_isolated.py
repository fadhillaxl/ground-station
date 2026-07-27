import sys
from typing import Any, Dict

# Copy map_sdr_config_to_args definition
def map_sdr_config_to_args(sdr_config: Dict[str, Any]) -> list[str]:
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

print("Static dict input mapping:")
print(map_sdr_config_to_args(sdr_config))
