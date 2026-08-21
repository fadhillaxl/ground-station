import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SensorsIcon from '@mui/icons-material/Sensors';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import {
  fetchSatellitesList,
  fetchLatestTelemetry,
  fetchTelemetryHistory,
  setSelectedSatellite,
  setHistoryTimeRange,
  setAutoRefresh,
} from './telemetry-slice.jsx';

export default function TtncTopBar() {
  const dispatch = useDispatch();
  const {
    apiUrl,
    selectedSatelliteUid,
    selectedSatelliteTitle,
    satellitesList,
    historyField,
    historyTimeRange,
    autoRefresh,
    loading,
    loadingHistory,
  } = useSelector((state) => state.telemetry);

  // Fetch satellites on mount
  useEffect(() => {
    dispatch(fetchSatellitesList({ apiUrl }));
  }, [dispatch, apiUrl]);

  // Fetch latest telemetry and history on satellite or time range change
  useEffect(() => {
    if (!selectedSatelliteUid) return;
    dispatch(fetchLatestTelemetry({ dashboardUid: selectedSatelliteUid, apiUrl }));
    dispatch(
      fetchTelemetryHistory({
        dashboardUid: selectedSatelliteUid,
        field: historyField || 'sw_ana_bus_v',
        from: historyTimeRange || 'now-2d',
        apiUrl,
      })
    );
  }, [dispatch, selectedSatelliteUid, historyField, historyTimeRange, apiUrl]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !selectedSatelliteUid) return;
    const interval = setInterval(() => {
      dispatch(fetchLatestTelemetry({ dashboardUid: selectedSatelliteUid, apiUrl }));
    }, 5000);
    return () => clearInterval(interval);
  }, [dispatch, autoRefresh, selectedSatelliteUid, apiUrl]);

  const handleSatelliteChange = (event) => {
    const uid = event.target.value;
    const sat = satellitesList.find((s) => s.dashboardUid === uid);
    dispatch(
      setSelectedSatellite({
        dashboardUid: uid,
        title: sat ? sat.title : uid,
      })
    );
  };

  const handleRefresh = () => {
    if (!selectedSatelliteUid) return;
    dispatch(fetchLatestTelemetry({ dashboardUid: selectedSatelliteUid, apiUrl }));
    dispatch(
      fetchTelemetryHistory({
        dashboardUid: selectedSatelliteUid,
        field: historyField || 'sw_ana_bus_v',
        from: historyTimeRange || 'now-2d',
        apiUrl,
      })
    );
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        mb: 1.5,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'border.main',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      {/* Title & Live Status */}
      <Stack direction="row" spacing={1.5} alignItems="center">
        <SensorsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              TTNC Telemetry & Command
            </Typography>
            <Chip
              label={autoRefresh ? 'LIVE POLLING' : 'PAUSED'}
              size="small"
              color={autoRefresh ? 'success' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Telemetry stream connected to {apiUrl}
          </Typography>
        </Box>
      </Stack>

      {/* Controls */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="ttnc-sat-select-label">Target Satellite</InputLabel>
          <Select
            labelId="ttnc-sat-select-label"
            value={selectedSatelliteUid || ''}
            label="Target Satellite"
            onChange={handleSatelliteChange}
          >
            {satellitesList.map((sat) => (
              <MenuItem key={sat.dashboardUid} value={sat.dashboardUid}>
                {sat.title} {sat.suid ? `(${sat.suid})` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="ttnc-timerange-label">Time Range</InputLabel>
          <Select
            labelId="ttnc-timerange-label"
            value={historyTimeRange || 'now-2d'}
            label="Time Range"
            onChange={(e) => dispatch(setHistoryTimeRange(e.target.value))}
          >
            <MenuItem value="now-6h">Past 6 Hours</MenuItem>
            <MenuItem value="now-1d">Past 24 Hours</MenuItem>
            <MenuItem value="now-2d">Past 2 Days</MenuItem>
            <MenuItem value="now-7d">Past 7 Days</MenuItem>
            <MenuItem value="now-30d">Past 30 Days</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant={autoRefresh ? 'outlined' : 'text'}
          color={autoRefresh ? 'success' : 'inherit'}
          size="small"
          onClick={() => dispatch(setAutoRefresh(!autoRefresh))}
          sx={{ height: 38 }}
        >
          {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
        </Button>

        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={loading || loadingHistory ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading || loadingHistory}
          sx={{ height: 38 }}
        >
          Refresh
        </Button>
      </Stack>
    </Paper>
  );
}
