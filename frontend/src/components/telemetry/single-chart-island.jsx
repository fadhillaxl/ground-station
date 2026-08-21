import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  useTheme,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import { fetchTelemetryHistory } from './telemetry-slice.jsx';

export default function TelemetrySingleChartIsland({
  field = 'sw_ana_bus_v',
  title = 'Bus Voltage',
  unit = 'V',
  color = '#29b6f6',
  gridEditable = false,
}) {
  const theme = useTheme();
  const dispatch = useDispatch();
  const {
    apiUrl,
    selectedSatelliteUid,
    historyTimeRange,
    fieldHistories,
    latestMetrics,
    loadingHistory,
  } = useSelector((state) => state.telemetry);
  const isEditing = useSelector(
    (state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable
  );

  // Fetch field data when satellite or time range changes
  useEffect(() => {
    if (!selectedSatelliteUid) return;
    dispatch(
      fetchTelemetryHistory({
        dashboardUid: selectedSatelliteUid,
        field,
        from: historyTimeRange || 'now-2d',
        apiUrl,
      })
    );
  }, [dispatch, selectedSatelliteUid, field, historyTimeRange, apiUrl]);

  const rawPoints = fieldHistories?.[field] || [];

  // Downsample points for smooth rendering
  const { chartData, minVal, maxVal, avgVal, latestVal } = useMemo(() => {
    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      const fallbackVal = latestMetrics?.[field];
      return {
        chartData: [],
        minVal: null,
        maxVal: null,
        avgVal: null,
        latestVal: fallbackVal !== undefined ? Number(fallbackVal) : null,
      };
    }

    const step = Math.max(1, Math.floor(rawPoints.length / 100));
    const sampled = [];
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < rawPoints.length; i += step) {
      const pt = rawPoints[i];
      const timeMs = pt.Time || pt.timestamp;
      const val = pt[field] !== undefined ? pt[field] : pt.Value;
      if (timeMs && val !== undefined) {
        const num = Number(val);
        if (!isNaN(num)) {
          sampled.push({
            time: new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            value: num,
          });
          if (num < min) min = num;
          if (num > max) max = num;
          sum += num;
          count++;
        }
      }
    }

    const lastPt = rawPoints[rawPoints.length - 1];
    const lastVal = lastPt?.[field] !== undefined ? lastPt[field] : lastPt?.Value;

    return {
      chartData: sampled,
      minVal: count > 0 ? min : null,
      maxVal: count > 0 ? max : null,
      avgVal: count > 0 ? (sum / count).toFixed(2) : null,
      latestVal: lastVal !== undefined ? Number(lastVal) : latestMetrics?.[field],
    };
  }, [rawPoints, field, latestMetrics]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{
          ...islandTitleBarSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 1,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <ShowChartIcon sx={{ fontSize: 16, color }} />
          <Typography variant="body2" fontWeight={700} noWrap>
            {title}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.8} alignItems="center">
          {loadingHistory && <CircularProgress size={12} thickness={5} />}
          {latestVal !== null && latestVal !== undefined && (
            <Chip
              size="small"
              label={`Latest: ${latestVal} ${unit}`}
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 700,
                bgcolor: `${color}22`,
                color: color,
                border: `1px solid ${color}44`,
              }}
            />
          )}
        </Stack>
      </TitleBar>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.4)',
        }}
      >
        {/* Quick Stats Banner */}
        <Stack direction="row" spacing={1} sx={{ mb: 0.5, px: 0.5 }}>
          {minVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Min: <strong>{minVal}</strong> {unit}
            </Typography>
          )}
          {maxVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Max: <strong>{maxVal}</strong> {unit}
            </Typography>
          )}
          {avgVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Avg: <strong>{avgVal}</strong> {unit}
            </Typography>
          )}
        </Stack>

        {/* Chart View */}
        <Box sx={{ flex: 1, minHeight: 0, width: '100%' }}>
          {chartData.length > 0 ? (
            <LineChart
              dataset={chartData}
              xAxis={[
                {
                  scaleType: 'band',
                  dataKey: 'time',
                  tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 9 },
                  tickInterval: (index, i) => i % Math.max(1, Math.floor(chartData.length / 5)) === 0,
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 9 },
                },
              ]}
              series={[
                {
                  dataKey: 'value',
                  label: `${title} (${unit})`,
                  color: color,
                  showMark: false,
                  curve: 'linear',
                  area: true,
                },
              ]}
              margin={{ top: 12, right: 12, bottom: 24, left: 36 }}
              slotProps={{
                legend: { hidden: true },
              }}
            />
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {loadingHistory ? 'Loading telemetry points...' : `No ${title} data points for selected window.`}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
