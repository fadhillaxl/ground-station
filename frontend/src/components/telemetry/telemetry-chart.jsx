import React from 'react';
import { Paper, Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';

export default function TelemetryChart({
  title = 'Telemetry Time-Series',
  data = [],
  seriesKeys = [], // Array of metric_key strings or objects [{ key: 'sw_ana_axis1_curr', label: 'AXIS 1 Current', color: '#00e676' }]
  height = 320,
}) {
  if (!data || data.length === 0) {
    return (
      <Paper
        elevation={2}
        sx={{
          p: 3,
          borderRadius: 2,
          minHeight: height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No telemetry time-series data available for this metric.
        </Typography>
      </Paper>
    );
  }

  // Pivot flat telemetry points by timestamp for multi-line x-charts
  const timeMap = {};
  data.forEach((pt) => {
    const ts = pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString() : '';
    if (!timeMap[ts]) {
      timeMap[ts] = { time: ts };
    }
    timeMap[ts][pt.metric_key] = pt.value;
  });

  const chartData = Object.values(timeMap);

  const series = seriesKeys.map((s, idx) => {
    const keyName = typeof s === 'string' ? s : s.key;
    const labelName = typeof s === 'string' ? s : s.label || s.key;
    const colorHex = typeof s === 'object' && s.color ? s.color : ['#00e676', '#29b6f6', '#ffb74d', '#e91e63'][idx % 4];

    return {
      dataKey: keyName,
      label: labelName,
      color: colorHex,
      showMark: false,
    };
  });

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} color="text.primary" mb={1}>
        {title}
      </Typography>

      <Box sx={{ width: '100%', height }}>
        <LineChart
          dataset={chartData}
          xAxis={[{ dataKey: 'time', scaleType: 'band' }]}
          series={series}
          height={height}
          margin={{ left: 50, right: 30, top: 20, bottom: 40 }}
          grid={{ vertical: true, horizontal: true }}
          sx={{
            '.MuiLineElement-root': {
              strokeWidth: 2,
            },
            '.MuiChartsAxis-tickLabel': {
              fill: '#94a3b8 !important',
              fontSize: 11,
            },
          }}
        />
      </Box>
    </Paper>
  );
}
