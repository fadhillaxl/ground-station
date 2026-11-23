import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { resolveUrl } from '../../utils/url.js';

const initialState = {
    status: {
        kiss: {
            connected: false,
            host: 'host.docker.internal',
            port: 8001,
            agwpePort: 8000,
            lastConnectedAt: null,
            reconnectAttempts: 0,
            lastError: null,
        },
        rigctld: {
            connected: false,
            host: 'host.docker.internal',
            port: 4532,
            latencyMs: null,
            lastCheckedAt: null,
            radioModel: 'Icom IC-9700',
            hamlibModelId: 3081,
            pttMethod: 'RIG 2 (Hamlib NET rigctl)',
            readOnlyMonitor: true,
        },
        stats: {
            totalPackets: 0,
            bufferedPackets: 0,
            channel0Packets1200: 0,
            channel1Packets9600: 0,
            lastPacketAt: null,
        },
    },
    packets: [],
    selectedPacketId: null,
    channelFilter: 'ALL', // 'ALL' | '0' | '1'
    searchQuery: '',
    viewMode: 'ASCII', // 'ASCII' | 'HEX'
    gridEditable: false,
    loading: false,
    simulating: false,
    error: null,
};

export const fetchDirewolfStatus = createAsyncThunk(
    'packets/fetchStatus',
    async ({ probe = true } = {}, { rejectWithValue }) => {
        try {
            const res = await fetch(resolveUrl(`/api/direwolf/status?probe=${probe}`));
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

export const fetchDirewolfPackets = createAsyncThunk(
    'packets/fetchPackets',
    async ({ limit = 200 } = {}, { rejectWithValue }) => {
        try {
            const res = await fetch(resolveUrl(`/api/direwolf/packets?limit=${limit}`));
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

export const clearDirewolfPackets = createAsyncThunk(
    'packets/clearPackets',
    async (_, { rejectWithValue }) => {
        try {
            const res = await fetch(resolveUrl('/api/direwolf/packets/clear'), {
                method: 'POST',
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

export const simulateDirewolfPresets = createAsyncThunk(
    'packets/simulatePresets',
    async (_, { rejectWithValue }) => {
        try {
            const res = await fetch(resolveUrl('/api/direwolf/simulate/presets'), {
                method: 'POST',
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

const packetsSlice = createSlice({
    name: 'packets',
    initialState,
    reducers: {
        receiveLivePacket(state, action) {
            const pkt = action.payload;
            if (!pkt || !pkt.id) return;
            const exists = state.packets.some((p) => p.id === pkt.id);
            if (!exists) {
                state.packets = [pkt, ...state.packets.slice(0, 499)];
            }
            if (!state.selectedPacketId) {
                state.selectedPacketId = pkt.id;
            }
        },
        receiveDirewolfStatus(state, action) {
            if (action.payload && typeof action.payload === 'object') {
                state.status = {
                    ...state.status,
                    ...action.payload,
                };
            }
        },
        receivePacketsCleared(state) {
            state.packets = [];
            state.selectedPacketId = null;
        },
        setSelectedPacketId(state, action) {
            state.selectedPacketId = action.payload;
        },
        setChannelFilter(state, action) {
            state.channelFilter = action.payload;
        },
        setSearchQuery(state, action) {
            state.searchQuery = action.payload;
        },
        setViewMode(state, action) {
            state.viewMode = action.payload;
        },
        setGridEditable(state, action) {
            state.gridEditable =
                action.payload !== undefined ? Boolean(action.payload) : !state.gridEditable;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchDirewolfStatus.fulfilled, (state, action) => {
                if (action.payload) {
                    state.status = { ...state.status, ...action.payload };
                }
            })
            .addCase(fetchDirewolfPackets.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchDirewolfPackets.fulfilled, (state, action) => {
                state.loading = false;
                const incoming = Array.isArray(action.payload?.packets)
                    ? action.payload.packets
                    : [];
                state.packets = incoming;
                if (action.payload?.status) {
                    state.status = { ...state.status, ...action.payload.status };
                }
                if (!state.selectedPacketId && incoming.length > 0) {
                    state.selectedPacketId = incoming[0].id;
                }
            })
            .addCase(fetchDirewolfPackets.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || 'Failed to load Direwolf packets';
            })
            .addCase(clearDirewolfPackets.fulfilled, (state, action) => {
                state.packets = [];
                state.selectedPacketId = null;
                if (action.payload?.status) {
                    state.status = { ...state.status, ...action.payload.status };
                }
            })
            .addCase(simulateDirewolfPresets.pending, (state) => {
                state.simulating = true;
            })
            .addCase(simulateDirewolfPresets.fulfilled, (state, action) => {
                state.simulating = false;
                const simPackets = Array.isArray(action.payload?.packets)
                    ? action.payload.packets
                    : [];
                simPackets.forEach((pkt) => {
                    if (!state.packets.some((p) => p.id === pkt.id)) {
                        state.packets.unshift(pkt);
                    }
                });
                state.packets = state.packets.slice(0, 500);
                if (simPackets.length > 0) {
                    state.selectedPacketId = simPackets[simPackets.length - 1].id;
                }
                if (action.payload?.status) {
                    state.status = { ...state.status, ...action.payload.status };
                }
            })
            .addCase(simulateDirewolfPresets.rejected, (state, action) => {
                state.simulating = false;
                state.error = action.payload || 'Failed to run satellite packet simulation';
            });
    },
});

export const {
    receiveLivePacket,
    receiveDirewolfStatus,
    receivePacketsCleared,
    setSelectedPacketId,
    setChannelFilter,
    setSearchQuery,
    setViewMode,
    setGridEditable,
} = packetsSlice.actions;

export default packetsSlice.reducer;
