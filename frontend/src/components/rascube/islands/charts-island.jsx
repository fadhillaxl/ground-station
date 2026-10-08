import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';

export default function RascubeChartsIsland({ gridEditable = false }) {
  const history = useSelector((state) => state.rascube?.telemetryHistory || []);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);
  const [metricKey, setMetricKey] = useState('voltage'); // 'voltage' | 'temp' | 'pressure'

  const getMetricData = () => {
    // Reverse so chronologically left-to-right
    const items = [...history].reverse();
    switch (metricKey) {
      case 'voltage':
        return items.map((s, idx) => ({
          idx,
          v5: s.eps?.main_5v_v ?? null,
          vbat: s.eps?.battery_charge?.bus_voltage_v ?? null,
        }));
      case 'temp':
        return items.map((s, idx) => ({
          idx,
          temp: s.environment?.temperature_c ?? null,
        }));
      case 'pressure':
        return items.map((s, idx) => ({
          idx,
          pres: s.environment?.pressure_hpa ?? null,
        }));
      default:
        return [];
    }
  };

  const points = getMetricData();

  // Simple SVG chart rendering
  const renderSvgChart = () => {
    if (points.length < 2) {
      return (
        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
          <Typography variant="caption">Need at least 2 telemetry points to render chart. Received {points.length}.</Typography>
        </Box>
      );
    }

    const width = 600;
    const height = 180;
    const padding = 25;

    let values = [];
    if (metricKey === 'voltage') {
      values = points.flatMap((p) => [p.v5, p.vbat]).filter((v) => v != null);
    } else if (metricKey === 'temp') {
      values = points.map((p) => p.temp).filter((v) => v != null);
    } else {
      values = points.map((p) => p.pres).filter((v) => v != null);
    }

    const minVal = values.length ? Math.min(...values) * 0.98 : 0;
    const maxVal = values.length ? Math.max(...values) * 1.02 : 10;
    const valRange = Math.max(0.001, maxVal - minVal);

    const getX = (idx) => padding + (idx / (points.length - 1)) * (width - padding * 2);
    const getY = (val) => height - padding - ((val - minVal) / valRange) * (height - padding * 2);

    const makeLinePath = (valKey) => {
      const validPoints = points
        .map((p) => ({ x: getX(p.idx), y: p[valKey] != null ? getY(p[valKey]) : null }))
        .filter((p) => p.y != null);
      if (validPoints.length === 0) return '';
      return validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    };

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.15)" />

        {/* Labels */}
        <text x={padding} y={padding - 6} fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace">
          {maxVal.toFixed(1)}
        </text>
        <text x={padding} y={height - padding + 15} fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace">
          {minVal.toFixed(1)}
        </text>

        {metricKey === 'voltage' && (
          <>
            <path d={makeLinePath('v5')} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
            <path d={makeLinePath('vbat')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeDasharray="4 2" />
          </>
        )}

        {metricKey === 'temp' && (
          <path d={makeLinePath('temp')} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
        )}

        {metricKey === 'pressure' && (
          <path d={makeLinePath('pres')} fill="none" stroke="#ec4899" strokeWidth="2.5" />
        )}
      </svg>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <ShowChartIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Real-time Telemetry Trends
          </Typography>
        </Stack>

        <ToggleButtonGroup
          value={metricKey}
          exclusive
          onChange={(_, val) => val && setMetricKey(val)}
          size="small"
          sx={{ height: 24 }}
        >
          <ToggleButton value="voltage" sx={{ px: 1, py: 0, fontSize: '0.68rem', textTransform: 'none' }}>
            Voltage
          </ToggleButton>
          <ToggleButton value="temp" sx={{ px: 1, py: 0, fontSize: '0.68rem', textTransform: 'none' }}>
            Temp
          </ToggleButton>
          <ToggleButton value="pressure" sx={{ px: 1, py: 0, fontSize: '0.68rem', textTransform: 'none' }}>
            Pressure
          </ToggleButton>
        </ToggleButtonGroup>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <Box sx={{ flex: 1, minHeight: 140, bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 2, p: 1, border: '1px solid', borderColor: 'divider' }}>
          {renderSvgChart()}
        </Box>
        {metricKey === 'voltage' && (
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 600 }}>● Main 5V Rail</Typography>
            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 600 }}>╌╌ Battery Voltage</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
