# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Optional, Tuple

from common.arguments import arguments as args


class RotatorController:
    def __init__(
        self,
        model: Optional[int] = None,  # Model no longer used directly
        host: Optional[str] = None,
        port: Optional[int] = None,
        verbose: bool = False,
        timeout: float = 10.0,
        auto_reconnect: bool = True,
    ):
        resolved_host = (host or os.getenv("ROTCTLD_HOST") or "127.0.0.1").strip()
        env_port = os.getenv("ROTCTLD_PORT") or "4533"
        resolved_port = int(port) if port is not None else int(env_port)

        # Set up logging
        device_path = f"{resolved_host}:{resolved_port}"
        self.logger = logging.getLogger("rotator-control")
        self.logger.setLevel(args.log_level)
        self.logger.info(f"Initializing RotatorController with device={device_path}")

        # Initialize attributes
        self.host = resolved_host
        self.port = resolved_port
        self.device_path = device_path
        self.verbose = verbose
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self.timeout = timeout
        self.auto_reconnect = auto_reconnect
        # Command lock ensures synchronous request-response framing over TCP
        self._lock = asyncio.Lock()

    async def _open_socket(self) -> None:
        """Open raw TCP stream to rotctld (with host.docker.internal fallback for local loopback in Docker)."""
        await self._close_socket()
        candidate_hosts = [self.host]
        if self.host in {"127.0.0.1", "localhost", "0.0.0.0"} and os.path.exists("/.dockerenv"):
            candidate_hosts.append("host.docker.internal")

        last_err: Optional[Exception] = None
        for target_host in candidate_hosts:
            try:
                self.reader, self.writer = await asyncio.wait_for(
                    asyncio.open_connection(target_host, self.port), timeout=self.timeout
                )
                self.connected = True
                return
            except Exception as err:
                last_err = err

        if last_err is not None:
            raise last_err

    async def _close_socket(self) -> None:
        """Close current TCP stream cleanly."""
        writer = self.writer
        self.connected = False
        self.reader = None
        self.writer = None
        if writer is not None:
            try:
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=1.5)
            except Exception:
                pass

    async def _read_position_lines(self, reader: asyncio.StreamReader) -> str:
        """
        Read newline-delimited rotctld position output.
        Standard rotctld replies to 'p\\n' with 2 lines: azimuth\\nelevation\\n,
        or 'RPRT <code>\\n' on error.
        """
        parts: list[str] = []
        while len(parts) < 2:
            line_bytes = await asyncio.wait_for(reader.readline(), timeout=self.timeout)
            if not line_bytes:
                raise ConnectionError("EOF received from rotctld while reading position")
            line_str = line_bytes.decode("utf-8", errors="replace").strip()
            if not line_str:
                continue
            if line_str.startswith("RPRT"):
                return line_str
            if line_str.startswith("get_pos:"):
                line_str = line_str.split(":", 1)[1].strip()
            parts.extend(line_str.split())
        return " ".join(parts)

    async def _read_single_line(self, reader: asyncio.StreamReader) -> str:
        """Read a single newline-terminated response line from rotctld."""
        line_bytes = await asyncio.wait_for(reader.readline(), timeout=self.timeout)
        if not line_bytes:
            raise ConnectionError("EOF received from rotctld")
        return line_bytes.decode("utf-8", errors="replace").strip()

    @classmethod
    def _verify_rprt_response(cls, response: str, operation: str) -> None:
        """Validate rotctld RPRT status code; raise RuntimeError if non-zero."""
        if response.startswith("RPRT"):
            parts = response.split()
            error_code = int(parts[1]) if len(parts) > 1 else -1
            if error_code != 0:
                msg = cls.get_error_message(error_code)
                raise RuntimeError(f"{operation} failed: {response} ({msg})")
            return
        raise RuntimeError(f"Unexpected rotctld response for {operation}: {response}")

    async def connect(self) -> bool:
        if self.connected and self.writer is not None and not self.writer.is_closing():
            self.logger.warning("Already connected to rotator")
            return True

        async with self._lock:
            try:
                self.logger.debug(f"Connecting to rotator at {self.device_path}")
                await self._open_socket()
                assert self.reader is not None and self.writer is not None

                # Verify rotctld responsiveness over the newly opened persistent socket
                self.writer.write(b"p\n")
                await self.writer.drain()
                probe = await self._read_position_lines(self.reader)
                if probe.startswith("RPRT"):
                    error_code = int(probe.split()[1])
                    if error_code < 0:
                        raise RuntimeError(f"Rotator probe rejected: {probe}")
                else:
                    tokens = probe.split()
                    if len(tokens) < 2:
                        raise RuntimeError(f"Invalid probe response from rotator: {probe}")
                    float(tokens[0])
                    float(tokens[1])

                self.logger.info(f"Successfully connected to rotator as {self.device_path}")
                return True

            except Exception as e:
                await self._close_socket()
                self.logger.error(f"Error connecting to rotator: {e}")
                raise RuntimeError(f"Error connecting to rotator: {e}")

    async def disconnect(self) -> bool:
        if not self.connected or self.writer is None:
            self.logger.warning("Not connected to rotator")
            return True

        async with self._lock:
            try:
                try:
                    self.writer.write(b"q\n")
                    await self.writer.drain()
                except Exception as e:
                    self.logger.warning(f"Error sending quit command: {e}")

                await self._close_socket()
                self.logger.info("Disconnected from rotator")
                return True

            except Exception as e:
                self.logger.error(f"Error disconnecting from rotator: {e}")
                return False

    @asynccontextmanager
    async def _create_connection(self):
        """Creates a temporary connection if not already connected."""
        if self.connected and self.reader is not None and self.writer is not None:
            yield self.reader, self.writer
        else:
            reader = writer = None
            try:
                candidate_hosts = [self.host]
                if self.host in {"127.0.0.1", "localhost", "0.0.0.0"} and os.path.exists(
                    "/.dockerenv"
                ):
                    candidate_hosts.append("host.docker.internal")

                last_err: Optional[Exception] = None
                for target_host in candidate_hosts:
                    try:
                        reader, writer = await asyncio.wait_for(
                            asyncio.open_connection(target_host, self.port), timeout=self.timeout
                        )
                        break
                    except Exception as err:
                        last_err = err
                if reader is None or writer is None:
                    raise last_err or ConnectionError(f"Failed to connect to {self.device_path}")
                yield reader, writer
            finally:
                if writer is not None and (not self.connected or writer is not self.writer):
                    writer.close()
                    try:
                        await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
                    except (asyncio.TimeoutError, Exception):
                        pass

    async def _execute_raw_command(self, command: str, waitforreply: bool = True) -> str:
        """Execute a single command on the active socket (caller holds self._lock)."""
        if self.writer is None or self.reader is None or self.writer.is_closing():
            raise ConnectionError("Socket is not open")

        full_command = f"{command.strip()}\n"
        self.writer.write(full_command.encode("ascii", errors="ignore"))
        await self.writer.drain()

        if not waitforreply:
            return "(no wait for reply)"

        if command.strip() == "p":
            return await self._read_position_lines(self.reader)
        return await self._read_single_line(self.reader)

    async def _send_command(self, command: str, waitforreply: bool = True) -> str:
        """
        Send a command to rotctld with serialized locking and automatic reconnection.
        """
        if not self.connected and not self.auto_reconnect:
            self.check_connection()

        async with self._lock:
            last_error: Optional[Exception] = None
            max_attempts = 2 if self.auto_reconnect else 1

            for attempt in range(max_attempts):
                try:
                    if not self.connected or self.writer is None or self.reader is None:
                        if attempt == 0 and not self.auto_reconnect:
                            self.check_connection()
                        self.logger.info(
                            f"Reconnecting to rotctld at {self.device_path} (attempt {attempt + 1})"
                        )
                        await self._open_socket()

                    response = await self._execute_raw_command(command, waitforreply=waitforreply)
                    if self.verbose:
                        self.logger.debug(f"Command: {command} -> Response: {response}")
                    return response

                except (
                    ConnectionError,
                    OSError,
                    asyncio.IncompleteReadError,
                    asyncio.TimeoutError,
                ) as e:
                    last_error = e
                    self.logger.warning(
                        f"rotctld transport error on '{command}' (attempt {attempt + 1}/{max_attempts}): {e}"
                    )
                    await self._close_socket()
                    if not self.auto_reconnect or attempt + 1 >= max_attempts:
                        break
                except Exception as e:
                    self.logger.error(f"Error sending command '{command}': {e}")
                    raise RuntimeError(f"Error communicating with rotator: {e}")

            self.logger.error(f"Error sending command '{command}': {last_error}")
            raise RuntimeError(f"Error communicating with rotator: {last_error}")

    async def ping(self) -> bool:
        try:
            async with self._create_connection() as (reader, writer):
                writer.write(b"p\n")
                await writer.drain()
                response = await self._read_position_lines(reader)
                if response.startswith("RPRT"):
                    error_code = int(response.split()[1])
                    return error_code >= 0
                parts = response.split()
                if len(parts) >= 2:
                    float(parts[0])
                    float(parts[1])
                    return True
                return False
        except Exception as e:
            self.logger.exception(e)
            return False

    async def get_position(self) -> Tuple[float, float]:
        """Get the current azimuth and elevation using rotctld 'p\\n'."""
        try:
            response = await self._send_command("p")

            if response.startswith("RPRT"):
                error_code = int(response.split()[1])
                if error_code < 0:
                    raise RuntimeError(f"Error getting position: {response}")
                return 0.0, 0.0

            if response.startswith("get_pos:"):
                parts = response.split(":", 1)[1].strip().split()
            else:
                parts = response.split()

            if len(parts) >= 2:
                try:
                    az = float(parts[0])
                    el = float(parts[1])
                    self.logger.debug(f"Current position: az={az}, el={el}")
                    return round(az, 3), round(el, 3)
                except ValueError:
                    raise RuntimeError(f"Invalid position values: {response}")

            raise RuntimeError(f"Invalid position format: {response}")

        except Exception as e:
            self.logger.error(f"Error getting position: {e}")
            raise RuntimeError(f"Error getting position: {e}")

    async def getPosition(self) -> Dict[str, float]:
        """Get current position as {'az': float, 'el': float}."""
        az, el = await self.get_position()
        return {"az": az, "el": el}

    async def setPosition(self, target_az: float, target_el: float) -> bool:
        """
        Send 'P <azimuth> <elevation>\\n' formatted to 2 decimal places and verify 'RPRT 0'.
        """
        try:
            command = f"P {float(target_az):.2f} {float(target_el):.2f}"
            self.logger.debug(f"Sending rotctld command: {command}")
            response = await self._send_command(command)
            self._verify_rprt_response(response, "Set position")
            return True
        except Exception as e:
            self.logger.error(f"Error setting rotator position: {e}")
            raise RuntimeError(f"Error setting rotator position: {e}")

    async def park(self, park_az=None, park_el=None) -> bool:
        """Park the rotator."""
        try:
            if (park_az is None) != (park_el is None):
                raise ValueError("park_az and park_el must either both be set or both be null")

            if park_az is not None and park_el is not None:
                self.logger.info(
                    "Parking rotator using configured target az=%s el=%s", park_az, park_el
                )
                response = await self._send_command(f"P {float(park_az):.2f} {float(park_el):.2f}")
            else:
                self.logger.info("Parking rotator using hardware-native park command")
                # Consume RPRT reply so unread bytes do not corrupt subsequent 'p' reads
                response = await self._send_command("K", waitforreply=True)

            if response.startswith("RPRT"):
                error_code = int(response.split()[1])
                if error_code != 0:
                    self.logger.error(f"Park command failed: {response}")
                    return False

            self.logger.info(f"Park command: response={response}")
            return True

        except Exception as e:
            self.logger.error(f"Error parking rotator: {e}")
            raise RuntimeError(f"Error parking rotator: {e}")

    def check_connection(self) -> bool:
        """Check if connected to the rotator."""
        if not self.connected or self.writer is None or self.reader is None:
            error_msg = f"Not connected to rotator (connected: {self.connected})"
            self.logger.error(error_msg)
            raise RuntimeError(error_msg)
        return True

    async def set_position(
        self,
        target_az: float,
        target_el: float,
        update_interval: float = 2,
        az_tolerance: float = 1.0,
        el_tolerance: float = 1.0,
    ) -> AsyncGenerator[Tuple[float, float, bool], None]:
        """Set the rotator position via 'P <az:.2f> <el:.2f>\\n' and yield slewing updates."""
        await self.setPosition(target_az, target_el)

        # Initial status
        current_az, current_el = await self.get_position()
        az_reached = abs(current_az - target_az) <= az_tolerance
        el_reached = abs(current_el - target_el) <= el_tolerance
        is_slewing = not (az_reached and el_reached)

        yield current_az, current_el, is_slewing

        while is_slewing:
            current_az, current_el = await self.get_position()
            az_reached = abs(current_az - target_az) <= az_tolerance
            el_reached = abs(current_el - target_el) <= el_tolerance
            is_slewing = not (az_reached and el_reached)
            yield current_az, current_el, is_slewing

    async def stop(self) -> bool:
        """Stop/halt the rotator using rotctld 'S\\n'."""
        try:
            response = await self._send_command("S")
            if response.startswith("RPRT"):
                error_code = int(response.split()[1])
                if error_code != 0:
                    self.logger.error(f"Stop command failed: {response}")
                    return False
                self.logger.info(f"Stop command: response={response}")
                return True

            self.logger.warning(f"Unexpected stop response: {response}")
            return False

        except Exception as e:
            self.logger.error(f"Error stopping rotator: {e}")
            raise RuntimeError(f"Error stopping rotator: {e}")

    async def set_rotation_speed(self, speed: float) -> bool:
        """Set the rotation speed."""
        try:
            command = f"R {speed}"
            response = await self._send_command(command)

            if response.startswith("RPRT"):
                error_code = int(response.split()[1])
                if error_code < 0:
                    self.logger.error(f"Set speed command failed: {response}")
                    return False

            self.logger.info(f"Set speed command: response={response}")
            return True

        except Exception as e:
            self.logger.error(f"Error setting rotation speed: {e}")
            raise RuntimeError(f"Error setting rotation speed: {e}")

    async def get_info(self) -> str:
        """Get rotator information."""
        try:
            response = await self._send_command("_")
            return response

        except Exception as e:
            self.logger.error(f"Error getting rotator info: {e}")
            raise RuntimeError(f"Error getting rotator info: {e}")

    async def set_conf(self, parameter: str, value: str) -> bool:
        """Set a configuration parameter."""
        try:
            command = f"set_conf {parameter} {value}"
            response = await self._send_command(command)

            if response.startswith("RPRT"):
                error_code = int(response.split()[1])
                if error_code < 0:
                    self.logger.error(f"Set configuration failed: {response}")
                    return False

            return True

        except Exception as e:
            self.logger.error(f"Error setting configuration: {e}")
            raise RuntimeError(f"Error setting configuration: {e}")

    async def get_conf(self, parameter: str) -> str:
        """Get a configuration parameter."""
        try:
            command = f"get_conf {parameter}"
            response = await self._send_command(command)
            return response

        except Exception as e:
            self.logger.error(f"Error getting configuration: {e}")
            raise RuntimeError(f"Error getting configuration: {e}")

    def __del__(self) -> None:
        """Destructor - log a warning if still connected when object is garbage collected."""
        if hasattr(self, "connected") and self.connected and hasattr(self, "logger"):
            try:
                self.logger.warning(
                    "Object RotatorController being garbage collected while still connected"
                )
                if hasattr(self, "writer") and self.writer is not None:
                    try:
                        self.writer.close()
                    except Exception as e:
                        self.logger.error(f"Error during cleanup: {e}")
            except Exception:
                pass

    @staticmethod
    def get_error_message(error_code: int) -> str:
        """Map error codes to messages."""
        error_messages = {
            0: "No error",
            -1: "Invalid parameter",
            -2: "Invalid configuration",
            -3: "Memory shortage",
            -4: "Function not implemented",
            -5: "Communication timed out",
            -6: "IO error",
            -7: "Internal error",
            -8: "Protocol error",
            -9: "Command rejected",
            -10: "String truncated",
            -11: "Function not available",
            -12: "Target not available",
            -13: "Bus error",
            -14: "Bus busy",
            -15: "Invalid argument",
            -16: "Invalid VFO",
            -17: "Argument out of domain",
        }

        return error_messages.get(error_code, f"Unknown error code: {error_code}")


# Alias for external callers expecting RotctldClient
RotctldClient = RotatorController
