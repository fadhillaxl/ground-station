import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Grid2 as Grid,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SensorsIcon from '@mui/icons-material/Sensors';

import MetricCard from './metric-card.jsx';
import TelemetryChart from './telemetry-chart.jsx';
import RawFrameInspector from './raw-frame-inspector.jsx';
import { useSocket } from '../common/socket.jsx';
import {
  setSelectedSatelliteId,
  fetchTelemetryHistory,
  fetchLatestTelemetry,
  receiveLiveTelemetry,
  importSatnogsSchema,
} from './telemetry-slice.jsx';

export default function TelemetryPage() {
  const dispatch = useDispatch();
  const { socket } = useSocket();

  const selectedSatelliteId = useSelector((state) => state.telemetry?.selectedSatelliteId || '98864');
  const latestMetrics = useSelector((state) => state.telemetry?.latestMetrics || {});
  const historyMetrics = useSelector((state) => state.telemetry?.historyMetrics || []);
  const rawFrames = useSelector((state) => state.telemetry?.rawFrames || []);
  const importedSchema = useSelector((state) => state.telemetry?.importedSchema || null);
  const loading = useSelector((state) => state.telemetry?.loading || false);

  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [importStatus, setImportStatus] = useState(null);

  // Listen to live Socket.IO telemetry events
  useEffect(() => {
    if (!socket) return;

    const handleLiveTelemetry = (eventData) => {
      dispatch(receiveLiveTelemetry(eventData));
    };

    socket.on('telemetry-live', handleLiveTelemetry);

    return () => {
      socket.off('telemetry-live', handleLiveTelemetry);
    };
  }, [socket, dispatch]);

  // Load telemetry data on satellite selection change
  useEffect(() => {
    dispatch(fetchLatestTelemetry({ satelliteId: selectedSatelliteId }));
    dispatch(fetchTelemetryHistory({ satelliteId: selectedSatelliteId, limit: 300 }));
  }, [dispatch, selectedSatelliteId]);

  const handleRefresh = () => {
    dispatch(fetchLatestTelemetry({ satelliteId: selectedSatelliteId }));
    dispatch(fetchTelemetryHistory({ satelliteId: selectedSatelliteId, limit: 300 }));
  };

  const handleImportSchemaSubmit = async () => {
    try {
      const parsedJson = JSON.parse(schemaText);
      const res = await dispatch(importSatnogsSchema({ schemaJson: parsedJson })).unwrap();
      setImportStatus({ type: 'success', message: `Imported dashboard schema '${res.title}' with ${res.panel_count} panels!` });
      setSchemaDialogOpen(false);
      setSchemaText('');
    } catch (err) {
      setImportStatus({ type: 'error', message: `Schema parse error: ${err}` });
    }
  };

  // Extract keys for charts
  const axisKeys = [
    { key: 'sw_ana_axis1_curr', label: 'AXIS 1 Current (A)', color: '#00e676' },
    { key: 'sw_ana_axis2_curr', label: 'AXIS 2 Current (A)', color: '#29b6f6' },
    { key: 'sw_ana_axis3_curr', label: 'AXIS 3 Current (A)', color: '#ffb74d' },
  ];

  const thermalKeys = [
    { key: 'temp_board', label: 'Board Temp (°C)', color: '#ff5252' },
    { key: 'temp_battery', label: 'Battery Temp (°C)', color: '#ab47bc' },
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 1600, margin: '0 auto' }}>
      {/* Header & Controls */}
      <Paper
        elevation={2}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2,
          background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SatelliteAltIcon sx={{ fontSize: 32, color: '#00e676' }} />
              <Box>
                <Typography variant="h5" fontWeight={700} color="text.primary">
                  TT&C Telemetry Dashboard
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Real-time satellite health monitoring & SatNOGS DB telemetry time-series
                </Typography>
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="satellite-select-label">Satellite (SUID/NORAD)</InputLabel>
                <Select
                  labelId="satellite-select-label"
                  value={selectedSatelliteId}
                  label="Satellite (SUID/NORAD)"
                  onChange={(e) => dispatch(setSelectedSatelliteId(e.target.value))}
                >
                  <MenuItem value="98864">AEPEX (SUID 98864)</MenuItem>
                  <MenuItem value="68506">AEPEX Primary (NORAD 68506)</MenuItem>
                  <MenuItem value="55088">GeoScan-Edelveis (NORAD 55088)</MenuItem>
                  <MenuItem value="40059">FUNCUBE-1 (NORAD 40059)</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="outlined"
                color="secondary"
                startIcon={<CloudUploadIcon />}
                onClick={() => setSchemaDialogOpen(true)}
              >
                Import Schema
              </Button>

              <Button
                variant="contained"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {importStatus && (
        <Alert severity={importStatus.type} sx={{ mb: 3 }} onClose={() => setImportStatus(null)}>
          {importStatus.message}
        </Alert>
      )}

      {/* Subsystem Health Stat Cards */}
      <Typography variant="subtitle1" fontWeight={700} color="text.secondary" mb={1.5} letterSpacing={0.5}>
        SUBSYSTEM HEALTH & POWER
      </Typography>

      <Grid container spacing={2} mb={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="AXIS 1 Current"
            value={latestMetrics['sw_ana_axis1_curr']?.value ?? 0.142}
            unit="A"
            status="normal"
            subtitle="ADCS Axis 1 Sensor"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="AXIS 2 Current"
            value={latestMetrics['sw_ana_axis2_curr']?.value ?? 0.158}
            unit="A"
            status="normal"
            subtitle="ADCS Axis 2 Sensor"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="AXIS 3 Current"
            value={latestMetrics['sw_ana_axis3_curr']?.value ?? 0.129}
            unit="A"
            status="normal"
            subtitle="ADCS Axis 3 Sensor"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Battery Voltage"
            value={latestMetrics['vbat']?.value ?? 8.24}
            unit="V"
            status="normal"
            subtitle="Main EPS Power Rail"
          />
        </Grid>
      </Grid>

      {/* Time-Series Charts */}
      <Grid container spacing={3} mb={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <TelemetryChart
            title="AXIS Currents History (ADCS Motors)"
            data={historyMetrics}
            seriesKeys={axisKeys}
            height={340}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <TelemetryChart
            title="Subsystem Temperatures (°C)"
            data={historyMetrics}
            seriesKeys={thermalKeys}
            height={340}
          />
        </Grid>
      </Grid>

      {/* Raw Telemetry Packet Inspector */}
      <RawFrameInspector frames={rawFrames} />

      {/* SatNOGS Schema Import Dialog */}
      <Dialog open={schemaDialogOpen} onClose={() => setSchemaDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Import SatNOGS Grafana Schema (JSON)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Paste the JSON schema output from SatNOGS Grafana Dashboard API to automatically import metric titles and math scaling multipliers (e.g. `* 0.0012207`).
          </Typography>
          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder='Paste JSON schema here... e.g. { "dashboard": { "title": "AEPEX", "panels": [...] } }'
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSchemaDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleImportSchemaSubmit} disabled={!schemaText.trim()}>
            Import Dashboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
