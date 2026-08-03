# Connects to remote RTL-TCP, bridges data to SatDump, and captures IQ samples for real-time FFT.

import asyncio
import logging
import time
import struct
import numpy as np
from typing import Callable, Optional

logger = logging.getLogger("weather-rtltcp-proxy")


class RTLTCPProxy:
    def __init__(self, remote_host: str, remote_port: int, local_host: str = "127.0.0.1"):
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.local_host = local_host
        self.server: Optional[asyncio.AbstractServer] = None
        self.local_port: Optional[int] = None
        self.remote_reader: Optional[asyncio.StreamReader] = None
        self.remote_writer: Optional[asyncio.StreamWriter] = None
        self.clients: list[asyncio.StreamWriter] = []
        self.running = False
        
        # FFT Configurable Settings
        self.fft_size = 1024
        self.fft_fps = 15
        self.fft_callback: Optional[Callable[[np.ndarray], None]] = None

    async def start(self) -> int:
        """Starts the local TCP server proxy and returns the local port it bound to."""
        self.running = True
        
        # Bind to a dynamically allocated free port on localhost
        self.server = await asyncio.start_server(
            self._handle_client, self.local_host, 0
        )
        
        # Extract the dynamically allocated port
        for s in self.server.sockets:
            self.local_port = s.getsockname()[1]
            break
            
        logger.info(
            f"RTL-TCP Proxy listening on {self.local_host}:{self.local_port}, "
            f"forwarding to {self.remote_host}:{self.remote_port}"
        )
        return self.local_port

    async def stop(self):
        """Stops the proxy and cleanly closes all client/remote connections."""
        self.running = False
        
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
            
        # Close all connected clients
        for client in self.clients:
            try:
                client.close()
                await client.wait_closed()
            except Exception:
                pass
        self.clients.clear()
        
        if self.remote_writer:
            try:
                self.remote_writer.close()
                await self.remote_writer.wait_closed()
            except Exception:
                pass
            self.remote_writer = None
            self.remote_reader = None

        logger.info("RTL-TCP Proxy stopped.")

    def set_frequency(self, freq_hz: int):
        """Sends a set frequency command (0x01) to the remote RTL-TCP server."""
        if self.remote_writer and not self.remote_writer.is_closing():
            try:
                cmd_packet = struct.pack(">BI", 0x01, int(freq_hz))
                self.remote_writer.write(cmd_packet)
                # Run the drain as a background task to avoid blocking the main thread
                asyncio.create_task(self.remote_writer.drain())
                logger.info(f"RTL-TCP Proxy: Sent set_frequency command: {freq_hz} Hz")
            except Exception as e:
                logger.error(f"RTL-TCP Proxy: Error setting frequency: {e}")

    def set_gain(self, gain_val: int):
        """Sends a set gain command (0x04) to the remote RTL-TCP server."""
        if self.remote_writer and not self.remote_writer.is_closing():
            try:
                # Convert float gain to integer tenths of a dB if needed.
                # However, rtl_tcp expects tenth dB values (e.g. 20.7 dB -> 207).
                # If they pass a raw integer (like 40), we convert it directly.
                cmd_val = int(gain_val)
                # Some SDRs expect Tenths of dB (if gain value is < 100 it's likely a direct value
                # but if it's typical RTL range like 0-50, let's treat it as tenths of dB, e.g. 400 for 40 dB)
                if cmd_val < 100:
                    cmd_val = int(cmd_val * 10)
                cmd_packet = struct.pack(">BI", 0x04, cmd_val)
                self.remote_writer.write(cmd_packet)
                asyncio.create_task(self.remote_writer.drain())
                logger.info(f"RTL-TCP Proxy: Sent set_gain command: {cmd_val} tenths of dB")
            except Exception as e:
                logger.error(f"RTL-TCP Proxy: Error setting gain: {e}")

    async def _handle_client(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
        """Handles a new incoming client (SatDump) connection."""
        logger.info("RTL-TCP Proxy: SatDump client connected to local proxy port.")
        self.clients.append(client_writer)
        
        try:
            # Establish the single upstream connection to the remote RTL-TCP server
            self.remote_reader, self.remote_writer = await asyncio.open_connection(
                self.remote_host, self.remote_port
            )
            logger.info(f"RTL-TCP Proxy: Connected to remote RTL-TCP at {self.remote_host}:{self.remote_port}")
        except Exception as e:
            logger.error(f"RTL-TCP Proxy: Failed to connect to remote RTL-TCP: {e}")
            client_writer.close()
            try:
                await client_writer.wait_closed()
            except Exception:
                pass
            if client_writer in self.clients:
                self.clients.remove(client_writer)
            return

        # Start downstream and upstream forwarders
        client_to_remote = asyncio.create_task(self._forward_client_to_remote(client_reader, self.remote_writer))
        remote_to_client = asyncio.create_task(self._forward_remote_to_client(self.remote_reader, client_writer))

        try:
            await asyncio.gather(client_to_remote, remote_to_client)
        except Exception as e:
            logger.debug(f"RTL-TCP Proxy: Bridged connections closed: {e}")
        finally:
            client_writer.close()
            try:
                await client_writer.wait_closed()
            except Exception:
                pass
            if client_writer in self.clients:
                self.clients.remove(client_writer)
            
            if self.remote_writer:
                self.remote_writer.close()
                try:
                    await self.remote_writer.wait_closed()
                except Exception:
                    pass

    async def _forward_client_to_remote(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Forwards control commands from SatDump to the remote RTL-TCP server."""
        try:
            while self.running:
                data = await reader.read(4096)
                if not data:
                    break
                writer.write(data)
                await writer.drain()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"RTL-TCP Proxy command forwarder error: {e}")

    async def _forward_remote_to_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Forwards raw IQ samples from remote RTL-TCP to SatDump and processes subset for FFT."""
        try:
            # Read standard 12-byte header first and forward
            header = await reader.readexactly(12)
            writer.write(header)
            await writer.drain()
            
            last_fft_time = 0.0
            
            while self.running:
                # Read chunks of IQ data from the network
                data = await reader.read(32768)
                if not data:
                    break
                
                # Forward to client (SatDump) immediately
                writer.write(data)
                await writer.drain()
                
                # Process FFT if callback is set and enough time has elapsed
                now = time.time()
                min_fft_interval = 1.0 / self.fft_fps
                required_bytes = self.fft_size * 2
                
                if self.fft_callback and (now - last_fft_time >= min_fft_interval) and len(data) >= required_bytes:
                    last_fft_time = now
                    # Extract a single chunk of length `required_bytes`
                    chunk = data[:required_bytes]
                    raw_samples = np.frombuffer(chunk, dtype=np.uint8)
                    
                    if len(raw_samples) == required_bytes:
                        # Convert offset binary IQ samples [0, 255] to complex floats
                        normalized = (raw_samples.astype(np.float32) - 127.5) / 127.5
                        iq_samples = normalized[0::2] + 1j * normalized[1::2]
                        
                        # Apply Hanning window
                        window = np.hanning(self.fft_size)
                        windowed = iq_samples * window
                        
                        # Compute FFT & shift DC center
                        fft_res = np.fft.fft(windowed)
                        fft_res = np.fft.fftshift(fft_res)
                        
                        # Normalize power levels in dB
                        normalization = (self.fft_size ** 2) * (np.sum(window ** 2) / self.fft_size)
                        power_db = 10 * np.log10((np.abs(fft_res) ** 2) / normalization + 1e-10)
                        
                        # Clip values for rendering sanity
                        power_db = np.clip(power_db, -100.0, 20.0)
                        
                        # Execute callback
                        try:
                            self.fft_callback(power_db)
                        except Exception as cb_err:
                            logger.error(f"Error in proxy FFT callback: {cb_err}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"RTL-TCP Proxy sample forwarder error: {e}")
