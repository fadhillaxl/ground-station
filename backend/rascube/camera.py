"""Progressive assembler and decoder for RASCube camera chunk frames."""

from __future__ import annotations

import base64
import struct
from typing import Optional

from rascube.models import CameraBlock


class CameraAssemblyError(ValueError):
    """Raised when camera chunk assembly fails."""


class CameraAssembler:
    """Progressive assembler for satellite camera chunks."""

    def __init__(self) -> None:
        self._blocks: dict[int, bytes] = {}
        self._duplicates: set[int] = set()

    @property
    def duplicates(self) -> frozenset[int]:
        return frozenset(self._duplicates)

    @property
    def block_count(self) -> int:
        return len(self._blocks)

    @property
    def blocks(self) -> dict[int, bytes]:
        return self._blocks

    def reset(self) -> None:
        """Clear all stored blocks."""
        self._blocks.clear()
        self._duplicates.clear()

    def add(self, block: CameraBlock) -> Optional[bytes]:
        """Add a chunk block. Returns complete JPEG bytes if full image is assembled."""
        if block.index in self._blocks:
            self._duplicates.add(block.index)
            if self._blocks[block.index] != block.data:
                raise CameraAssemblyError(
                    f"Camera block {block.index} was repeated with different data"
                )
        self._blocks[block.index] = block.data

        if 0 not in self._blocks:
            return None

        contiguous = self.get_contiguous_bytes()
        if len(contiguous) >= 2 and contiguous[:2] != b"\xff\xd8":
            raise CameraAssemblyError(
                "Contiguous camera data does not begin with JPEG SOI (\\xff\\xd8)"
            )

        eoi = contiguous.find(b"\xff\xd9")
        if eoi < 0:
            return None
        return bytes(contiguous[: eoi + 2])

    def get_contiguous_bytes(self) -> bytearray:
        """Assemble all sequentially contiguous blocks starting from index 0."""
        contiguous = bytearray()
        index = 0
        while index in self._blocks:
            contiguous.extend(self._blocks[index])
            index += 1
        return contiguous

    def get_partial_jpeg(self) -> Optional[bytes]:
        """Synthesize a viewable partial JPEG by appending EOI marker to contiguous bytes."""
        contiguous = self.get_contiguous_bytes()
        if len(contiguous) < 2 or contiguous[:2] != b"\xff\xd8":
            return None

        # If already contains EOI, return as is
        eoi = contiguous.find(b"\xff\xd9")
        if eoi >= 0:
            return bytes(contiguous[: eoi + 2])

        # Synthesize EOI so browsers/decoders can render partial image
        return bytes(contiguous) + b"\xff\xd9"

    def get_partial_jpeg_base64(self) -> Optional[str]:
        """Return base64-encoded partial JPEG string."""
        partial = self.get_partial_jpeg()
        if not partial:
            return None
        return base64.b64encode(partial).decode("ascii")


def parse_camera_frame_bytes(raw: bytes) -> CameraBlock:
    """Parse a camera frame byte sequence into a CameraBlock.

    Handles frames with or without [port, len] header.
    Standard RASCube camera payload is 242 bytes: 2-byte little-endian block index + 240 bytes image data.
    """
    if len(raw) in (244, 245):
        # 1 byte port (0x15/0x20) + optional len byte (242) + 242 payload bytes
        payload = raw[2:] if len(raw) == 244 else raw[3:]
    elif len(raw) == 243:
        payload = raw[1:]
    elif len(raw) == 242:
        payload = raw
    else:
        # Fallback: extract last 242 bytes or whatever is present
        payload = raw

    if len(payload) < 2:
        raise CameraAssemblyError(f"Camera frame too short: {len(payload)} bytes")

    block_index = struct.unpack_from("<H", payload, 0)[0]
    data = payload[2:]
    return CameraBlock(index=block_index, data=data)
