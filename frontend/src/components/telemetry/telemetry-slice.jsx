import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getApiBaseUrl } from '../../utils/url.js';

export const fetchTelemetryHistory = createAsyncThunk(
  'telemetry/fetchTelemetryHistory',
  async ({ satelliteId, metricKeys, limit = 500 }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (metricKeys && metricKeys.length > 0) {
        params.append('metric_keys', metricKeys.join(','));
      }
      params.append('limit', String(limit));

      const response = await fetch(
        `${getApiBaseUrl()}/api/telemetry/${satelliteId}/history?${params.toString()}`
      );
      const data = await response.json();
      if (!data.success) {
        return rejectWithValue(data.error);
      }
      return { satelliteId, history: data.data };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchLatestTelemetry = createAsyncThunk(
  'telemetry/fetchLatestTelemetry',
  async ({ satelliteId }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/telemetry/${satelliteId}/latest`);
      const data = await response.json();
      if (!data.success) {
        return rejectWithValue(data.error);
      }
      return { satelliteId, latest: data.data };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const importSatnogsSchema = createAsyncThunk(
  'telemetry/importSatnogsSchema',
  async ({ schemaJson }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/telemetry/import-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schemaJson),
      });
      const data = await response.json();
      if (!data.success) {
        return rejectWithValue(data.error);
      }
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState: {
    selectedSatelliteId: '98864', // Default SUID (e.g. AEPEX / SatNOGS)
    latestMetrics: {},
    historyMetrics: [],
    importedSchema: null,
    rawFrames: [],
    loading: false,
    error: null,
  },
  reducers: {
    setSelectedSatelliteId(state, action) {
      state.selectedSatelliteId = action.payload;
    },
    receiveLiveTelemetry(state, action) {
      const { satellite_id, data } = action.payload;
      if (String(satellite_id) === String(state.selectedSatelliteId)) {
        if (data?.points) {
          data.points.forEach((pt) => {
            const key = pt.metric_key || pt.key;
            if (key) {
              state.latestMetrics[key] = {
                metric_key: key,
                value: pt.value,
                unit: pt.unit,
                timestamp: new Date().toISOString(),
              };
            }
          });
        }
        if (data?.raw) {
          state.rawFrames.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            raw: data.raw,
          });
          if (state.rawFrames.length > 50) {
            state.rawFrames.pop();
          }
        }
      }
    },
    clearTelemetryData(state) {
      state.latestMetrics = {};
      state.historyMetrics = [];
      state.rawFrames = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTelemetryHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTelemetryHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.historyMetrics = action.payload.history;
      })
      .addCase(fetchTelemetryHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch telemetry history';
      })
      .addCase(fetchLatestTelemetry.fulfilled, (state, action) => {
        state.latestMetrics = action.payload.latest;
      })
      .addCase(importSatnogsSchema.fulfilled, (state, action) => {
        state.importedSchema = action.payload;
      });
  },
});

export const { setSelectedSatelliteId, receiveLiveTelemetry, clearTelemetryData } =
  telemetrySlice.actions;

export default telemetrySlice.reducer;
