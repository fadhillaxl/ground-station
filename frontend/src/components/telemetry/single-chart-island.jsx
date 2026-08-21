import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TuneIcon from '@mui/icons-material/Tune';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import { fetchTelemetryHistory } from './telemetry-slice.jsx';

const FIELD_ALIASES = {
  sw_adcs_analogs_digital_bus_v: ['sw_adcs_analogs_digital_bus_v', 'sw_ana_bus_v', 'sw_ana_5p0_v', 'sw_ana_3p3_v'],
  sw_ana_3p3_i: ['sw_ana_3p3_i', 'sw_ana_eps_bus_i', 'sw_ana_axis1_curr', 'sw_ana_afire_curr'],
  sw_ana_bat1_v: ['sw_ana_bat1_v', 'sw_ana_bat_v', 'sw_ana_batt_v', 'sw_ana_5p0_v'],
  sw_ana_eps_temp: ['sw_ana_eps_temp', 'sw_adcs_analogs_det_temp', 'sw_adcs_analogs_motor1_temp'],
  sw_ana_cdh_temp: ['sw_ana_cdh_temp', 'sw_adcs_analogs_motor2_temp', 'sw_adcs_analogs_motor3_temp'],
  sw_ana_axis1_curr: ['sw_ana_axis1_curr', 'sw_ana_sa1_i', 'sw_ana_axis2_curr', 'sw_ana_axis3_curr'],
};

/**
 * Intelligent telemetry engineering unit converter and scaler:
 * Converts raw ADC / centi-degrees / mV into standard engineering units.
 */
export function scaleTelemetryValue(field, rawVal, defaultUnit = '') {
  if (rawVal === null || rawVal === undefined || isNaN(Number(rawVal))) {
    return { val: 0, displayUnit: defaultUnit };
  }
  const num = Number(rawVal);
  const lowField = (field || '').toLowerCase();

  // 1. Temperature fields: raw integer is centi-degrees (e.g. 2662 -> 26.62 °C)
  if (lowField.includes('temp')) {
    const scaled = num > 100 ? num / 100 : num;
    return { val: Number(scaled.toFixed(2)), displayUnit: '°C' };
  }

  // 2. Voltage fields: raw integer is mV (e.g. 3866 mV -> 3.866 V, 1786 mV -> 1.786 V)
  if (lowField.includes('volt') || lowField.endsWith('_v') || lowField.includes('_bus_v') || lowField.includes('_bat')) {
    const scaled = num > 50 ? num / 1000 : num;
    return { val: Number(scaled.toFixed(3)), displayUnit: 'V' };
  }

  // 3. Current fields: raw integer is mA (e.g. 471 mA -> 471 mA or 0.471 A)
  if (lowField.includes('curr') || lowField.endsWith('_i') || lowField.includes('_bus_i')) {
    if (defaultUnit === 'A' && num > 10) {
      return { val: Number((num / 1000).toFixed(3)), displayUnit: 'A' };
    }
    return { val: Number(num.toFixed(1)), displayUnit: defaultUnit || 'mA' };
  }

  return { val: Number(num.toFixed(2)), displayUnit: defaultUnit };
}

export default function TelemetrySingleChartIsland({
  field: defaultField = 'sw_adcs_analogs_digital_bus_v',
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
    rawFrames,
    loadingHistory,
  } = useSelector((state) => state.telemetry);
  const isEditing = useSelector(
    (state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable
  );

  const [selectedField, setSelectedField] = useState(defaultField);
  const [showPicker, setShowPicker] = useState(false);

  // Auto-resolve best matching field from aliases if defaultField not in latestMetrics
  const resolvedField = useMemo(() => {
    if (selectedField !== defaultField) return selectedField;
    if (latestMetrics && selectedField in latestMetrics && latestMetrics[selectedField] !== null) {
      return selectedField;
    }
    const aliases = FIELD_ALIASES[defaultField] || [];
    for (const alias of aliases) {
      if (latestMetrics && alias in latestMetrics && latestMetrics[alias] !== null && latestMetrics[alias] !== undefined) {
        return alias;
      }
    }
    return defaultField;
  }, [selectedField, defaultField, latestMetrics]);

  // Fetch field data when satellite or time range changes
  useEffect(() => {
    if (!selectedSatelliteUid) return;
    dispatch(
      fetchTelemetryHistory({
        dashboardUid: selectedSatelliteUid,
        field: resolvedField,
        from: historyTimeRange || 'now-2d',
        apiUrl,
      })
    );
  }, [dispatch, selectedSatelliteUid, resolvedField, historyTimeRange, apiUrl]);

  // Available channel keys for picker dropdown
  const availableChannels = useMemo(() => {
    if (!latestMetrics) return [];
    return Object.keys(latestMetrics)
      .filter((k) => typeof latestMetrics[k] === 'number' || (!isNaN(Number(latestMetrics[k])) && latestMetrics[k] !== null && latestMetrics[k] !== ''))
      .sort();
  }, [latestMetrics]);

  // Build chart dataset by scaling & converting raw points
  const { chartData, minVal, maxVal, avgVal, latestVal, displayUnit } = useMemo(() => {
    const rawPoints = fieldHistories?.[resolvedField] || [];
    const pointsMap = new Map();

    // 1. Ingest InfluxDB history points
    if (Array.isArray(rawPoints)) {
      rawPoints.forEach((pt) => {
        const timeVal = pt.Time || pt.time || pt.timestamp || pt.Timestamp;
        const val = pt[resolvedField] !== undefined ? pt[resolvedField] : (pt.Value !== undefined ? pt.Value : pt.value);
        if (timeVal && val !== undefined && val !== null) {
          const num = Number(val);
          if (!isNaN(num)) {
            const timeMs = typeof timeVal === 'number' ? timeVal : new Date(timeVal).getTime();
            pointsMap.set(timeMs, num);
          }
        }
      });
    }

    // 2. Ingest live raw frames stream
    if (Array.isArray(rawFrames)) {
      rawFrames.forEach((frame) => {
        const timeVal = frame.timestamp || frame.raw?.Time;
        const rawObj = frame.raw || frame;
        const val = rawObj[resolvedField];
        if (timeVal && val !== undefined && val !== null) {
          const num = Number(val);
          if (!isNaN(num)) {
            const timeMs = typeof timeVal === 'number' ? timeVal : new Date(timeVal).getTime();
            if (!pointsMap.has(timeMs)) {
              pointsMap.set(timeMs, num);
            }
          }
        }
      });
    }

    // If still empty but latestMetrics has a value, seed an initial point
    if (pointsMap.size === 0 && latestMetrics?.[resolvedField] !== undefined && latestMetrics?.[resolvedField] !== null) {
      const num = Number(latestMetrics[resolvedField]);
      if (!isNaN(num)) {
        pointsMap.set(Date.now(), num);
      }
    }

    // Sort chronologically
    const sortedEntries = Array.from(pointsMap.entries()).sort((a, b) => a[0] - b[0]);
    if (sortedEntries.length === 0) {
      const { val: fallbackScaled, displayUnit: unitFallback } = scaleTelemetryValue(
        resolvedField,
        latestMetrics?.[resolvedField],
        unit
      );
      return {
        chartData: [],
        minVal: null,
        maxVal: null,
        avgVal: null,
        latestVal: latestMetrics?.[resolvedField] !== undefined ? fallbackScaled : null,
        displayUnit: unitFallback,
      };
    }

    // Scale each point and determine unit
    let resolvedUnit = unit;
    const step = Math.max(1, Math.floor(sortedEntries.length / 80));
    const sampled = [];
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < sortedEntries.length; i += step) {
      const [tMs, rawNum] = sortedEntries[i];
      const { val: scaledNum, displayUnit: curUnit } = scaleTelemetryValue(resolvedField, rawNum, unit);
      resolvedUnit = curUnit;
      sampled.push({
        time: new Date(tMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        value: scaledNum,
      });
      if (scaledNum < min) min = scaledNum;
      if (scaledNum > max) max = scaledNum;
      sum += scaledNum;
      count++;
    }

    // Ensure last point is included
    const [lastTime, lastRawNum] = sortedEntries[sortedEntries.length - 1];
    const { val: lastScaled, displayUnit: finalUnit } = scaleTelemetryValue(resolvedField, lastRawNum, unit);
    if (sampled.length > 0 && sampled[sampled.length - 1].value !== lastScaled) {
      sampled.push({
        time: new Date(lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        value: lastScaled,
      });
    }

    return {
      chartData: sampled,
      minVal: count > 0 ? min.toFixed(2) : null,
      maxVal: count > 0 ? max.toFixed(2) : null,
      avgVal: count > 0 ? (sum / count).toFixed(2) : null,
      latestVal: lastScaled,
      displayUnit: finalUnit || resolvedUnit,
    };
  }, [fieldHistories, resolvedField, rawFrames, latestMetrics, unit]);

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
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
          <ShowChartIcon sx={{ fontSize: 16, color, flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={700} noWrap sx={{ fontSize: '0.82rem' }}>
            {title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: { xs: 'none', sm: 'inline' } }}>
            ({resolvedField})
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.6} alignItems="center">
          {loadingHistory && <CircularProgress size={12} thickness={5} />}

          {latestVal !== null && latestVal !== undefined && (
            <Chip
              size="small"
              label={`${latestVal} ${displayUnit}`}
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

          <Tooltip title="Select Channel">
            <IconButton
              size="small"
              onClick={() => setShowPicker(!showPicker)}
              sx={{ p: 0.3, color: showPicker ? color : 'text.secondary' }}
            >
              <TuneIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </TitleBar>

      {/* Quick Channel Picker Dropdown */}
      {showPicker && (
        <Box sx={{ px: 1, py: 0.5, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <FormControl fullWidth size="small">
            <Select
              value={resolvedField}
              onChange={(e) => {
                setSelectedField(e.target.value);
                setShowPicker(false);
              }}
              size="small"
              sx={{ fontSize: '0.72rem', height: 26 }}
            >
              {availableChannels.map((k) => (
                <MenuItem key={k} value={k} sx={{ fontSize: '0.72rem' }}>
                  {k} ({latestMetrics[k]})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

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
        <Stack direction="row" spacing={1.5} sx={{ mb: 0.5, px: 0.5 }}>
          {minVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Min: <strong style={{ color: theme.palette.text.primary }}>{minVal}</strong> {displayUnit}
            </Typography>
          )}
          {maxVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Max: <strong style={{ color: theme.palette.text.primary }}>{maxVal}</strong> {displayUnit}
            </Typography>
          )}
          {avgVal !== null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Avg: <strong style={{ color: theme.palette.text.primary }}>{avgVal}</strong> {displayUnit}
            </Typography>
          )}
          <Typography variant="caption" sx={{ ml: 'auto', color: 'text.secondary', fontSize: '0.65rem' }}>
            {chartData.length} pts
          </Typography>
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
                  tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 8 },
                  tickInterval: (index, i) => i % Math.max(1, Math.floor(chartData.length / 4)) === 0,
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 8 },
                },
              ]}
              series={[
                {
                  dataKey: 'value',
                  label: `${title} (${displayUnit})`,
                  color: color,
                  showMark: chartData.length < 15,
                  curve: 'linear',
                  area: true,
                },
              ]}
              margin={{ top: 8, right: 10, bottom: 22, left: 38 }}
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
                gap: 0.5,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                {loadingHistory ? 'Loading telemetry points...' : `Waiting for ${resolvedField} telemetry points...`}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
