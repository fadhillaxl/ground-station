import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { resolveUrl } from '../../utils/url.js';

export const DEFAULT_TELEMETRY_API = '';

const getTelemetryEndpoint = (path, customApiUrl = '') => {
  if (
    !customApiUrl ||
    customApiUrl.includes('192.168.55.40:4001') ||
    customApiUrl === 'http://192.168.55.40:4001'
  ) {
    return resolveUrl(`/api/ttnc/${path.replace(/^\//, '')}`);
  }
  return `${customApiUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};

// Fetch list of satellites from Telemetry API or fallback
export const fetchSatellitesList = createAsyncThunk(
  'telemetry/fetchSatellitesList',
  async ({ apiUrl = DEFAULT_TELEMETRY_API } = {}, { rejectWithValue }) => {
    try {
      const endpoint = getTelemetryEndpoint('satellites', apiUrl);
      const response = await fetch(endpoint);
      const data = await response.json();
      if (data && Array.isArray(data.satellites)) {
        return data.satellites;
      }
      return rejectWithValue('Invalid satellites payload');
    } catch (err) {
      // Fallback local list if API server unreachable
      return [
        { dashboardUid: 'bflu6sloxxslcd', title: 'AEPEX', suid: '68506', tags: ['active', 'stable'] },
        { dashboardUid: 'QGujdBBZk', title: 'AAUSAT4', suid: '41460', tags: ['active'] },
        { dashboardUid: 'Abuh9WFHk', title: 'ALSat-1n', suid: '41789', tags: ['active'] },
        { dashboardUid: 'bfhvxrnomp91ca', title: 'COSMO', suid: '50001', tags: ['active'] },
        { dashboardUid: '9DnJFFO4z', title: 'Geoscan-Edelveis', suid: '55088', tags: ['active'] },
        { dashboardUid: 'ffc0ehd32qfpcc', title: 'UMKA-1', suid: '57172', tags: ['active'] },
      ];
    }
  }
);

// Fetch latest telemetry for a satellite
export const fetchLatestTelemetry = createAsyncThunk(
  'telemetry/fetchLatestTelemetry',
  async ({ dashboardUid = 'bflu6sloxxslcd', apiUrl = DEFAULT_TELEMETRY_API } = {}, { rejectWithValue }) => {
    try {
      const endpoint = getTelemetryEndpoint(`satellites/${dashboardUid}/latest`, apiUrl);
      const response = await fetch(endpoint);
      const data = await response.json();
      return {
        dashboardUid,
        satellite: data.satellite,
        suid: data.suid,
        latest: data.latest || {},
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// Fetch history time-series data for a field
export const fetchTelemetryHistory = createAsyncThunk(
  'telemetry/fetchTelemetryHistory',
  async ({ dashboardUid = 'bflu6sloxxslcd', field = 'sw_ana_bus_v', from = 'now-2d', to = 'now', apiUrl = DEFAULT_TELEMETRY_API }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams({ field, from, to });
      const endpoint = getTelemetryEndpoint(`satellites/${dashboardUid}/history?${params.toString()}`, apiUrl);
      const response = await fetch(endpoint);
      const data = await response.json();
      return {
        dashboardUid,
        field,
        from,
        to,
        points: Array.isArray(data.points) ? data.points : [],
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// Execute custom InfluxQL query
export const executeInfluxQuery = createAsyncThunk(
  'telemetry/executeInfluxQuery',
  async ({ dashboardUid = 'bflu6sloxxslcd', query, from = 'now-1d', to = 'now', apiUrl = DEFAULT_TELEMETRY_API }, { rejectWithValue }) => {
    try {
      const endpoint = getTelemetryEndpoint(`satellites/${dashboardUid}/query`, apiUrl);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, from, to }),
      });
      const data = await response.json();
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const importSatnogsSchema = createAsyncThunk(
  'telemetry/importSatnogsSchema',
  async ({ schemaJson }, { rejectWithValue }) => {
    try {
      const response = await fetch(resolveUrl('/api/telemetry/import-schema'), {
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

const initialState = {
  apiUrl: DEFAULT_TELEMETRY_API,
  selectedSatelliteUid: 'bflu6sloxxslcd', // AEPEX default UID
  selectedSatelliteTitle: 'AEPEX',
  satellitesList: [
    { dashboardUid: 'bflu6sloxxslcd', title: 'AEPEX', suid: '68506', tags: ['active', 'stable'] },
    { dashboardUid: 'QGujdBBZk', title: 'AAUSAT4', suid: '41460', tags: ['active'] },
    { dashboardUid: 'Abuh9WFHk', title: 'ALSat-1n', suid: '41789', tags: ['active'] },
    { dashboardUid: 'bfhvxrnomp91ca', title: 'COSMO', suid: '50001', tags: ['active'] },
    { dashboardUid: '9DnJFFO4z', title: 'Geoscan-Edelveis', suid: '55088', tags: ['active'] },
    { dashboardUid: 'ffc0ehd32qfpcc', title: 'UMKA-1', suid: '57172', tags: ['active'] },
  ],
  latestMetrics: {},
  historyMetrics: [],
  historyField: 'sw_ana_bus_v',
  historyTimeRange: 'now-2d',
  importedSchema: null,
  rawFrames: [],
  gridEditable: false,
  autoRefresh: true,
  refreshIntervalMs: 5000,
  loading: false,
  loadingHistory: false,
  error: null,
};

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    setGridEditable(state, action) {
      state.gridEditable = Boolean(action.payload);
    },
    setSelectedSatellite(state, action) {
      const { dashboardUid, title } = action.payload;
      state.selectedSatelliteUid = dashboardUid;
      if (title) state.selectedSatelliteTitle = title;
    },
    setHistoryField(state, action) {
      state.historyField = action.payload;
    },
    setHistoryTimeRange(state, action) {
      state.historyTimeRange = action.payload;
    },
    setAutoRefresh(state, action) {
      state.autoRefresh = Boolean(action.payload);
    },
    setApiUrl(state, action) {
      state.apiUrl = action.payload;
    },
    receiveLiveTelemetry(state, action) {
      const { satellite_id, data } = action.payload;
      if (String(satellite_id) === String(state.selectedSatelliteUid)) {
        if (data?.points) {
          data.points.forEach((pt) => {
            const key = pt.metric_key || pt.key;
            if (key) {
              state.latestMetrics[key] = pt.value;
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
      .addCase(fetchSatellitesList.fulfilled, (state, action) => {
        state.satellitesList = action.payload;
      })
      .addCase(fetchLatestTelemetry.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLatestTelemetry.fulfilled, (state, action) => {
        state.loading = false;
        const latest = action.payload.latest || {};
        state.latestMetrics = latest;

        // Ingest into raw frames history log
        if (Object.keys(latest).length > 0) {
          state.rawFrames.unshift({
            id: Date.now(),
            timestamp: latest.Time ? new Date(latest.Time).toISOString() : new Date().toISOString(),
            raw: latest,
          });
          if (state.rawFrames.length > 100) {
            state.rawFrames.pop();
          }
        }
      })
      .addCase(fetchLatestTelemetry.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch latest telemetry';
      })
      .addCase(fetchTelemetryHistory.pending, (state) => {
        state.loadingHistory = true;
      })
      .addCase(fetchTelemetryHistory.fulfilled, (state, action) => {
        state.loadingHistory = false;
        state.historyMetrics = action.payload.points;
      })
      .addCase(fetchTelemetryHistory.rejected, (state, action) => {
        state.loadingHistory = false;
      })
      .addCase(importSatnogsSchema.fulfilled, (state, action) => {
        state.importedSchema = action.payload;
      });
  },
});

export const {
  setGridEditable,
  setSelectedSatellite,
  setHistoryField,
  setHistoryTimeRange,
  setAutoRefresh,
  setApiUrl,
  receiveLiveTelemetry,
  clearTelemetryData,
} = telemetrySlice.actions;

export default telemetrySlice.reducer;
