import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import { setHistoryField, fetchTelemetryHistory } from './telemetry-slice.jsx';
import { LineChart } from '@mui/x-charts/LineChart';

const AVAILABLE_FIELDS = [
  { key: 'sw_ana_bus_v', label: 'Main Bus Voltage (Raw / V)', color: '#29b6f6' },
  { key: 'sw_ana_eps_bus_i', label: 'EPS Bus Current (Raw / A)', color: '#00e676' },
  { key: 'sw_ana_bat1_v', label: 'Battery 1 Voltage (Raw / V)', color: '#ab47bc' },
  { key: 'sw_ana_eps_temp', label: 'EPS Temperature (Raw / °C)', color: '#ff5252' },
  { key: 'sw_ana_cdh_temp', label: 'CD&H OBC Temperature (Raw / °C)', color: '#ff9800' },
  { key: 'sw_adcs_wheel_sp1', label: 'Reaction Wheel 1 Speed (RPM)', color: '#26c6da' },
  { key: 'sw_ana_sa1_i', label: 'Solar Array 1 Current', color: '#ffd54f' },
  { key: 'sw_ana_sa2_i', label: 'Solar Array 2 Current', color: '#ffb74d' },
];

export default function TelemetryChartIsland({ gridEditable = false }) {
  const dispatch = useDispatch();
  const {
    apiUrl,
    selectedSatelliteUid,
    historyField,
    historyTimeRange,
    historyMetrics,
    loadingHistory,
  } = useSelector((state) => state.telemetry);
  const isEditing = useSelector((state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable);

  const activeFieldConfig = AVAILABLE_FIELDS.find((f) => f.key === historyField) || AVAILABLE_FIELDS[0];

  const handleFieldChange = (e) => {
    const nextField = e.target.value;
    dispatch(setHistoryField(nextField));
    if (selectedSatelliteUid) {
      dispatch(
        fetchTelemetryHistory({
          dashboardUid: selectedSatelliteUid,
          field: nextField,
          from: historyTimeRange || 'now-2d',
          apiUrl,
        })
      );
    }
  };

  // Downsample or prepare chart dataset
  const chartData = React.useMemo(() => {
    if (!Array.isArray(historyMetrics) || historyMetrics.length === 0) {
      return [];
    }

    // Limit to max 150 points for smooth rendering
    const step = Math.max(1, Math.floor(historyMetrics.length / 150));
    const sampled = [];
    for (let i = 0; i < historyMetrics.length; i += step) {
      const pt = historyMetrics[i];
      const timeMs = pt.Time || pt.timestamp;
      const val = pt[historyField] !== undefined ? pt[historyField] : pt.Value;
      if (timeMs && val !== undefined) {
        sampled.push({
          time: new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          value: Number(val),
        });
      }
    }
    return sampled;
  }, [historyMetrics, historyField]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        <Typography variant="body2" fontWeight={700}>
          Telemetry Time-Series History
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          {loadingHistory && <CircularProgress size={14} thickness={5} />}
          <FormControl size="small" sx={{ minWidth: 200, my: 0 }}>
            <Select
              value={historyField || 'sw_ana_bus_v'}
              onChange={handleFieldChange}
              size="small"
              sx={{ height: 26, fontSize: '0.75rem' }}
            >
              {AVAILABLE_FIELDS.map((field) => (
                <MenuItem key={field.key} value={field.key} sx={{ fontSize: '0.8rem' }}>
                  {field.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </TitleBar>

      <Box sx={{ p: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {chartData.length === 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
            <Typography variant="body2" color="text.secondary">
              {loadingHistory ? 'Loading historical time-series...' : 'No telemetry points available in selected time range.'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', flex: 1, minHeight: 0 }}>
            <LineChart
              dataset={chartData}
              xAxis={[{ dataKey: 'time', scaleType: 'band' }]}
              series={[
                {
                  dataKey: 'value',
                  label: activeFieldConfig.label,
                  color: activeFieldConfig.color,
                  showMark: false,
                },
              ]}
              margin={{ left: 55, right: 20, top: 15, bottom: 30 }}
              grid={{ vertical: false, horizontal: true }}
              sx={{
                width: '100%',
                height: '100%',
                '.MuiLineElement-root': {
                  strokeWidth: 2,
                },
                '.MuiChartsAxis-tickLabel': {
                  fontSize: 10,
                },
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
