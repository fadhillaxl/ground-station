# GEO-KOMPSAT-2A (GK-2A) pipeline configurations for weather satellite live decoding.

PIPELINES = {
    "gk2a_lrit": {
        "name": "GEO-KOMPSAT-2A LRIT",
        "satdump_pipeline": "gk2a_lrit",
        "frequency_hz": 1692.14e6,
        "bandwidth_hz": 200000,
        "demodulator": "bpsk",
        "symbol_rate": 64000,
        "viterbi": True,
        "deframer": "ccsds",
        "default_parameters": {
            "write_images": True,
            "write_emwin": True,
            "write_messages": True,
            "write_unknown": False,
        }
    },
    "gk2a_hrit": {
        "name": "GEO-KOMPSAT-2A HRIT",
        "satdump_pipeline": "gk2a_hrit",
        "frequency_hz": 1695.4e6,
        "bandwidth_hz": 3000000,
        "demodulator": "qpsk",
        "symbol_rate": 500000,
        "viterbi": True,
        "deframer": "ccsds",
        "default_parameters": {
            "write_images": True,
            "write_emwin": True,
            "write_messages": True,
            "write_unknown": False,
        }
    }
}
