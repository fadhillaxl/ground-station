# Copyright (c) 2025 Efstratios Goudelis

import asyncio

import pytest

from controllers.rotator import RotatorController, RotctldClient
from tracker.rotatorhandler import RotatorHandler


@pytest.mark.asyncio
async def test_rotctld_protocol_fragmented_reads_and_commands():
    received_commands = []
    current_pos = [120.5, 30.25]

    async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                cmd = line.decode("ascii").strip()
                received_commands.append(cmd)

                if cmd == "p":
                    # Simulate fragmented TCP packets across two lines
                    payload = f"{current_pos[0]:.2f}\n{current_pos[1]:.2f}\n".encode("ascii")
                    writer.write(payload[:4])
                    await writer.drain()
                    await asyncio.sleep(0.01)
                    writer.write(payload[4:])
                    await writer.drain()
                elif cmd.startswith("P "):
                    _, az_s, el_s = cmd.split()
                    current_pos[0] = float(az_s)
                    current_pos[1] = float(el_s)
                    writer.write(b"RPRT 0\n")
                    await writer.drain()
                elif cmd == "S":
                    writer.write(b"RPRT 0\n")
                    await writer.drain()
                elif cmd == "q":
                    break
        finally:
            writer.close()

    server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    async with server:
        client = RotctldClient(host="127.0.0.1", port=port, timeout=2.0)
        assert await client.connect() is True

        # Concurrent getPosition and setPosition must serialize via command lock
        pos_before, set_ok, pos_after = await asyncio.gather(
            client.getPosition(),
            client.setPosition(145.2, 42.5),
            client.get_position(),
        )
        assert pos_before == {"az": 120.5, "el": 30.25}
        assert set_ok is True
        assert pos_after == (145.2, 42.5)
        assert "P 145.20 42.50" in received_commands

        assert await client.stop() is True
        assert "S" in received_commands

        assert await client.disconnect() is True


@pytest.mark.asyncio
async def test_rotctld_nonzero_rprt_raises_error():
    async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                cmd = line.decode("ascii").strip()
                if cmd == "p":
                    writer.write(b"0.0\n0.0\n")
                elif cmd.startswith("P "):
                    writer.write(b"RPRT -1\n")
                await writer.drain()
        finally:
            writer.close()

    server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    async with server:
        client = RotatorController(host="127.0.0.1", port=port, timeout=2.0)
        await client.connect()
        with pytest.raises(RuntimeError, match="RPRT -1"):
            await client.setPosition(10.0, 20.0)
        await client.disconnect()


@pytest.mark.asyncio
async def test_rotctld_auto_reconnect_after_server_drop():
    connection_count = 0

    async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        nonlocal connection_count
        connection_count += 1
        conn_id = connection_count
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                cmd = line.decode("ascii").strip()
                if cmd == "p":
                    # Drop the first connection on second 'p' (after connect probe)
                    if (
                        conn_id == 1
                        and writer.get_extra_info("peername")
                        and getattr(handle_client, "probed", False)
                    ):
                        break
                    handle_client.probed = True
                    writer.write(b"90.0\n15.0\n")
                    await writer.drain()
        finally:
            writer.close()

    server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    async with server:
        client = RotatorController(host="127.0.0.1", port=port, timeout=2.0)
        await client.connect()
        # First connection drops when 'p' is sent; client should auto-reconnect on conn #2
        az, el = await client.get_position()
        assert (az, el) == (90.0, 15.0)
        assert connection_count == 2
        await client.disconnect()


@pytest.mark.asyncio
async def test_rotator_handler_stopped_state_invokes_stop():
    stop_called = False

    class _MockController:
        async def stop(self):
            nonlocal stop_called
            stop_called = True
            return True

    class _DummyTracker:
        def __init__(self):
            self.rotator_controller = _MockController()
            self.rotator_data = {
                "connected": True,
                "tracking": True,
                "slewing": True,
                "stopped": False,
                "parked": False,
            }
            self.rotator_command_state = {}

    tracker = _DummyTracker()
    handler = RotatorHandler(tracker)
    await handler.handle_rotator_state_change("tracking", "stopped")

    assert stop_called is True
    assert tracker.rotator_data["stopped"] is True
    assert tracker.rotator_data["tracking"] is False
    assert tracker.rotator_data["slewing"] is False
