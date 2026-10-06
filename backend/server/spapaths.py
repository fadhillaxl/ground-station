from pathlib import Path


def is_static_asset_request(full_path: str) -> bool:
    normalized = full_path.lstrip('/')
    for prefix in ("groundstationdev/", "groundstation/"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    return normalized.startswith(("static/", "assets/")) or normalized == "favicon.ico"


def resolve_static_asset_path(static_root: Path, full_path: str) -> Path:
    normalized = full_path.lstrip('/')
    for prefix in ("groundstationdev/", "groundstation/"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    resolved_path = (static_root / normalized).resolve()
    resolved_path.relative_to(static_root)
    return resolved_path

