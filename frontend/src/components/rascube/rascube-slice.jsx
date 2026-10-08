import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const initialState = {
  isConnected: false,
  serialNumber: 1581,
  baudRate: 1000000,
  connectedPort: null,
  source: 'client_web_serial',
  latestTelemetry: null,
  telemetryHistory: [],
  camera: {
    status: 'idle', // 'idle' | 'capturing' | 'completed' | 'failed'
    progress: {
      blocks_received: 0,
      total_bytes: 0,
      started_at: null,
      elapsed_seconds: 0.0,
      transfer_speed_bps: 0.0,
      latest_block_index: 0,
      error: null,
    },
    chunks: [],
    latestImageBase64: null,
    latestImageMetadata: null,
    partialImageBase64: null,
  },
  uplinkLogs: [],
  gridEditable: false,
  loading: false,
  error: null,
};

// Async Thunks
export const fetchRascubeStatus = createAsyncThunk(
  'rascube/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/status');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const updateRascubeStatus = createAsyncThunk(
  'rascube/updateStatus',
  async ({ isConnected, serialNumber, source = 'client_web_serial' }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_connected: isConnected,
          serial_number: serialNumber,
          source,
        }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchLatestTelemetry = createAsyncThunk(
  'rascube/fetchLatestTelemetry',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/telemetry/latest');
      if (!res.ok) {
        if (res.status === 503) return null;
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchTelemetryHistory = createAsyncThunk(
  'rascube/fetchTelemetryHistory',
  async ({ limit = 50 } = {}, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/rascube/telemetry/history?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      return data.samples || [];
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchCameraStatus = createAsyncThunk(
  'rascube/fetchCameraStatus',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/camera/status');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchLatestCameraImage = createAsyncThunk(
  'rascube/fetchLatestCameraImage',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/camera/latest');
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const triggerCameraSession = createAsyncThunk(
  'rascube/triggerCameraSession',
  async ({ timeout = 35.0 } = {}, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/camera/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout, source: 'client_web_serial' }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const ingestTelemetryHex = createAsyncThunk(
  'rascube/ingestTelemetryHex',
  async ({ hex, source = 'client_web_serial' }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/telemetry/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex, source }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      return data.telemetry;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const ingestCameraChunkHex = createAsyncThunk(
  'rascube/ingestCameraChunkHex',
  async ({ hex, source = 'client_web_serial' }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/camera/chunk/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex, source }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      return data.chunk;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const decodeHexPayload = createAsyncThunk(
  'rascube/decodeHexPayload',
  async ({ hex }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rascube/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const rascubeSlice = createSlice({
  name: 'rascube',
  initialState,
  reducers: {
    setConnectionState: (state, action) => {
      state.isConnected = action.payload.isConnected;
      if (action.payload.serialNumber !== undefined) {
        state.serialNumber = action.payload.serialNumber;
      }
      if (action.payload.connectedPort !== undefined) {
        state.connectedPort = action.payload.connectedPort;
      }
    },
    setSerialNumber: (state, action) => {
      state.serialNumber = Number(action.payload) || 1581;
    },
    setBaudRate: (state, action) => {
      state.baudRate = Number(action.payload) || 1000000;
    },
    setGridEditable: (state, action) => {
      state.gridEditable = action.payload !== undefined ? action.payload : !state.gridEditable;
    },
    receiveLiveTelemetry: (state, action) => {
      const sample = action.payload;
      if (!sample) return;
      state.latestTelemetry = sample;
      state.isConnected = true;
      // Prepend to history, keep max 100 items
      state.telemetryHistory = [sample, ...state.telemetryHistory.slice(0, 99)];
    },
    receiveLiveCameraChunk: (state, action) => {
      const chunk = action.payload;
      if (!chunk) return;
      // Append chunk to list if not already present
      const exists = state.camera.chunks.some((c) => c.index === chunk.index);
      if (!exists) {
        state.camera.chunks.push(chunk);
      }
      // Update progress
      state.camera.progress.blocks_received = chunk.total_blocks || state.camera.chunks.length;
      state.camera.progress.total_bytes = chunk.total_bytes || state.camera.chunks.length * (chunk.size || 240);
      state.camera.progress.latest_block_index = chunk.index;
      state.camera.progress.elapsed_seconds = chunk.elapsed_seconds || state.camera.progress.elapsed_seconds;
      if (chunk.partial_jpeg_base64) {
        state.camera.partialImageBase64 = chunk.partial_jpeg_base64;
      }
    },
    resetCameraState: (state) => {
      state.camera.status = 'capturing';
      state.camera.chunks = [];
      state.camera.partialImageBase64 = null;
      state.camera.progress = {
        blocks_received: 0,
        total_bytes: 0,
        started_at: Date.now(),
        elapsed_seconds: 0.0,
        transfer_speed_bps: 0.0,
        latest_block_index: 0,
        error: null,
      };
    },
    addUplinkLog: (state, action) => {
      const item = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        ...action.payload,
      };
      state.uplinkLogs = [item, ...state.uplinkLogs.slice(0, 49)];
    },
    clearUplinkLogs: (state) => {
      state.uplinkLogs = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // Status
      .addCase(fetchRascubeStatus.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.isConnected = action.payload.is_connected;
        state.connectedPort = action.payload.connected_port;
        if (action.payload.serial_number) state.serialNumber = action.payload.serial_number;
        state.camera.status = action.payload.camera_status || state.camera.status;
      })
      // Latest Telemetry
      .addCase(fetchLatestTelemetry.fulfilled, (state, action) => {
        if (action.payload) {
          state.latestTelemetry = action.payload;
        }
      })
      // Telemetry History
      .addCase(fetchTelemetryHistory.fulfilled, (state, action) => {
        state.telemetryHistory = action.payload || [];
      })
      // Camera Status
      .addCase(fetchCameraStatus.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.camera.status = action.payload.status;
        if (action.payload.progress) {
          state.camera.progress = action.payload.progress;
        }
        if (action.payload.chunks) {
          state.camera.chunks = action.payload.chunks;
        }
        if (action.payload.metadata) {
          state.camera.latestImageMetadata = action.payload.metadata;
        }
      })
      // Latest Camera Image
      .addCase(fetchLatestCameraImage.fulfilled, (state, action) => {
        if (action.payload) {
          state.camera.latestImageBase64 = action.payload.jpeg_base64;
          state.camera.latestImageMetadata = action.payload.metadata;
          state.camera.status = 'completed';
        }
      })
      // Trigger Camera
      .addCase(triggerCameraSession.fulfilled, (state) => {
        state.camera.status = 'capturing';
        state.camera.chunks = [];
        state.camera.partialImageBase64 = null;
      });
  },
});

export const {
  setConnectionState,
  setSerialNumber,
  setBaudRate,
  setGridEditable,
  receiveLiveTelemetry,
  receiveLiveCameraChunk,
  resetCameraState,
  addUplinkLog,
  clearUplinkLogs,
} = rascubeSlice.actions;

export default rascubeSlice.reducer;
