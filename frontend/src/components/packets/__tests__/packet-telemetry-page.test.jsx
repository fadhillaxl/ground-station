import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { setupTheme } from '../../../theme.js';
import packetsReducer from '../packets-slice.jsx';
import PacketTelemetryPage from '../packet-telemetry-page.jsx';
import { getNavigation } from '../../../config/navigation.jsx';

vi.mock('../../common/socket.jsx', () => ({
    useSocket: () => ({ socket: null }),
}));

const SAMPLE_PACKETS = [
    {
        id: 'pkt-cubesat-9600',
        timestamp: '2026-11-18T14:00:03Z',
        channel: 1,
        baudRate: 9600,
        modulation: 'FSK/GFSK',
        sourceCallsign: 'CUBESAT-1',
        destinationCallsign: 'BEACON',
        digipeaters: [],
        controlField: '0x03',
        pid: '0xF0',
        payloadAscii: '...<..',
        payloadHex: '01 A4 0F 3C 1B 88',
        payloadLength: 6,
        isBinary: true,
        satellitePreset: 'CubeSat Telemetry',
        decodedTelemetry: {
            format: 'CUBESAT_BINARY_BEACON',
            metrics: [
                { key: 'battery_voltage', label: 'Battery Voltage', value: 3.9, unit: 'V' },
                { key: 'obc_temperature', label: 'OBC Temperature', value: 27, unit: '°C' },
            ],
        },
        hexDumpLines: [{ offset: '0000', hex: '01 A4 0F 3C 1B 88', ascii: '...<..' }],
        rawBytes: [1, 2, 3],
        rawHex: '01 02 03',
    },
    {
        id: 'pkt-iss-1200',
        timestamp: '2026-11-18T14:00:02Z',
        channel: 0,
        baudRate: 1200,
        modulation: 'AFSK',
        sourceCallsign: 'RS0ISS',
        destinationCallsign: 'CQ',
        digipeaters: ['ARISS'],
        controlField: '0x03',
        pid: '0xF0',
        payloadAscii: '>ARISS - International Space Station Packet Digipeater Active',
        payloadHex: '3E 41 52 49 53 53',
        payloadLength: 61,
        isBinary: false,
        satellitePreset: 'ISS (ARISS)',
        decodedTelemetry: null,
        hexDumpLines: [{ offset: '0000', hex: '3E 41 52 49 53 53', ascii: '>ARISS' }],
        rawBytes: [4, 5, 6],
        rawHex: '04 05 06',
    },
    {
        id: 'pkt-lapan-1200',
        timestamp: '2026-11-18T14:00:01Z',
        channel: 0,
        baudRate: 1200,
        modulation: 'AFSK',
        sourceCallsign: 'YB0X-1',
        destinationCallsign: 'CQ',
        digipeaters: ['ARISS', 'SGATE'],
        controlField: '0x03',
        pid: '0xF0',
        payloadAscii: '=0615.20S/10648.10E-LAPAN-A2/IO-86 Equatorial Orbit APRS Test Jakarta',
        payloadHex: '3D 30 36 31 35 2E',
        payloadLength: 69,
        isBinary: false,
        satellitePreset: 'LAPAN-A2 / IO-86',
        decodedTelemetry: null,
        hexDumpLines: [{ offset: '0000', hex: '3D 30 36 31 35 2E', ascii: '=0615.' }],
        rawBytes: [7, 8, 9],
        rawHex: '07 08 09',
    },
];

function createStoreWithPackets() {
    return configureStore({
        reducer: {
            dashboard: () => ({ isEditing: false }),
            packets: packetsReducer,
        },
        preloadedState: {
            packets: {
                status: {
                    kiss: { connected: true, host: 'host.docker.internal', port: 8001, agwpePort: 8000 },
                    rigctld: {
                        connected: true,
                        host: 'host.docker.internal',
                        port: 4532,
                        latencyMs: 1.4,
                        radioModel: 'Icom IC-9700',
                        hamlibModelId: 3081,
                        readOnlyMonitor: true,
                    },
                    stats: {
                        totalPackets: 3,
                        bufferedPackets: 3,
                        channel0Packets1200: 2,
                        channel1Packets9600: 1,
                    },
                },
                packets: SAMPLE_PACKETS,
                selectedPacketId: 'pkt-cubesat-9600',
                channelFilter: 'ALL',
                searchQuery: '',
                viewMode: 'ASCII',
                gridEditable: false,
                loading: false,
                simulating: false,
                error: null,
            },
        },
    });
}

describe('PacketTelemetryPage UI & Navigation', () => {
    beforeEach(() => {
        global.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ packets: SAMPLE_PACKETS }),
            })
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders status badges, live packet feed, ASCII/Hex toggle, and AX.25 inspector', () => {
        const store = createStoreWithPackets();
        const theme = setupTheme('dark');

        render(
            <Provider store={store}>
                <ThemeProvider theme={theme}>
                    <MemoryRouter>
                        <PacketTelemetryPage />
                    </MemoryRouter>
                </ThemeProvider>
            </Provider>
        );

        // Status badges for KISS :8001 & External rigctld :4532
        expect(screen.getByText(/Packet & Telemetry \(Direwolf AX\.25 \/ KISS\)/i)).toBeTruthy();
        expect(screen.getByText(/KISS :8001 CONNECTED/i)).toBeTruthy();
        expect(screen.getByText(/rigctld :4532 ONLINE \(IC-9700/i)).toBeTruthy();

        // All 3 satellite packets visible in feed & inspector decoded telemetry
        expect(screen.getAllByText('CUBESAT-1').length).toBeGreaterThan(0);
        expect(screen.getByText('RS0ISS')).toBeTruthy();
        expect(screen.getByText('YB0X-1')).toBeTruthy();
        expect(screen.getByText(/3\.9 V/i)).toBeTruthy();
        expect(screen.getByText(/27 °C/i)).toBeTruthy();

        // Toggle to Hex Dump mode
        fireEvent.click(screen.getByRole('button', { name: 'Hex Dump' }));
        expect(screen.getAllByText('01 A4 0F 3C 1B 88').length).toBeGreaterThan(0);

        // Search filter by callsign
        const searchInput = screen.getByPlaceholderText(/Search callsign/i);
        fireEvent.change(searchInput, { target: { value: 'YB0X-1' } });
        expect(screen.queryByText('RS0ISS')).toBeNull();
        expect(screen.getAllByText('YB0X-1').length).toBeGreaterThan(0);
    });

    it('includes Packet & Telemetry entry in main operations navigation', () => {
        const navItems = getNavigation({ isAdmin: false });
        const packetItem = navItems.find((item) => item.segment === 'packets');
        expect(packetItem).toBeTruthy();
        expect(packetItem.title).toBe('Packet & Telemetry');
    });
});
