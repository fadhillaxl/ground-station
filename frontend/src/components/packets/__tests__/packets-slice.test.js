import { describe, it, expect } from 'vitest';
import packetsReducer, {
    receiveLivePacket,
    receiveDirewolfStatus,
    receivePacketsCleared,
    setSelectedPacketId,
    setChannelFilter,
    setSearchQuery,
    setViewMode,
} from '../packets-slice.jsx';

describe('packetsSlice reducer', () => {
    it('handles receiveLivePacket and auto-selects first packet', () => {
        const initial = packetsReducer(undefined, { type: '@@INIT' });
        const samplePacket = {
            id: 'pkt-lapan-1',
            timestamp: '2026-11-18T13:45:00Z',
            channel: 0,
            baudRate: 1200,
            sourceCallsign: 'YB0X-1',
            destinationCallsign: 'CQ',
            digipeaters: ['ARISS', 'SGATE'],
            controlField: '0x03',
            pid: '0xF0',
            payloadAscii: '=0615.20S/10648.10E-LAPAN-A2/IO-86 Equatorial Orbit APRS Test Jakarta',
            payloadHex: '3D 30 36',
            satellitePreset: 'LAPAN-A2 / IO-86',
        };

        const next = packetsReducer(initial, receiveLivePacket(samplePacket));
        expect(next.packets).toHaveLength(1);
        expect(next.packets[0].sourceCallsign).toBe('YB0X-1');
        expect(next.selectedPacketId).toBe('pkt-lapan-1');

        // Deduplicates identical packet ID
        const duplicate = packetsReducer(next, receiveLivePacket(samplePacket));
        expect(duplicate.packets).toHaveLength(1);
    });

    it('handles channel filter, search query, view mode, status, and clear', () => {
        let state = packetsReducer(undefined, { type: '@@INIT' });
        state = packetsReducer(state, setChannelFilter('1'));
        state = packetsReducer(state, setSearchQuery('CUBESAT-1'));
        state = packetsReducer(state, setViewMode('HEX'));
        state = packetsReducer(state, setSelectedPacketId('pkt-9600'));

        expect(state.channelFilter).toBe('1');
        expect(state.searchQuery).toBe('CUBESAT-1');
        expect(state.viewMode).toBe('HEX');
        expect(state.selectedPacketId).toBe('pkt-9600');

        state = packetsReducer(
            state,
            receiveDirewolfStatus({
                kiss: { connected: true, host: 'host.docker.internal', port: 8001 },
                rigctld: { connected: true, host: 'host.docker.internal', port: 4532, hamlibModelId: 3081 },
            })
        );
        expect(state.status.kiss.connected).toBe(true);
        expect(state.status.rigctld.connected).toBe(true);
        expect(state.status.rigctld.port).toBe(4532);

        state = packetsReducer(state, receivePacketsCleared());
        expect(state.packets).toHaveLength(0);
        expect(state.selectedPacketId).toBeNull();
    });
});
