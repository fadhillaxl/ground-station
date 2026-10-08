import React from 'react';
import { useSelector } from 'react-redux';
import { Box, Grid, Typography, Card, CardContent, Chip, Stack } from '@mui/material';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import SpeedIcon from '@mui/icons-material/Speed';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';

function RascubeMetricCard({ title, value, unit = '', subtitle, icon, status = 'normal' }) {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#38bdf8';
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: 'none',
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {title}
          </Typography>
          {icon && (
            <Box sx={{ color: getStatusColor(), display: 'flex', alignItems: 'center' }}>
              {icon}
            </Box>
          )}
        </Stack>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, fontFamily: 'monospace', color: 'text.primary' }}>
          {value ?? '-'} <Typography component="span" variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{unit}</Typography>
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', fontFamily: 'monospace' }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function RascubeMetricCardsIsland({ gridEditable = false }) {
  const latest = useSelector((state) => state.rascube?.latestTelemetry);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);

  // EPS
  const v5 = latest?.eps?.main_5v_v != null ? `${latest.eps.main_5v_v.toFixed(2)}` : null;
  const v33 = latest?.eps?.main_3v3_v != null ? `${latest.eps.main_3v3_v.toFixed(2)}` : null;
  const vbat = latest?.eps?.battery_charge?.bus_voltage_v != null ? `${latest.eps.battery_charge.bus_voltage_v.toFixed(2)}` : null;
  const ibat = latest?.eps?.battery_charge?.current_a != null ? `${(latest.eps.battery_charge.current_a * 1000).toFixed(0)}` : null;

  // Environment
  const temp = latest?.environment?.temperature_c != null ? `${latest.environment.temperature_c.toFixed(1)}` : null;
  const pres = latest?.environment?.pressure_hpa != null ? `${latest.environment.pressure_hpa.toFixed(1)}` : null;
  const alt = latest?.environment?.altitude_m != null ? `${latest.environment.altitude_m.toFixed(0)}` : null;

  // GPS
  const hasFix = latest?.gps?.fix ?? false;
  const sats = latest?.gps?.satellites ?? 0;
  const coords = latest?.gps ? `${latest.gps.latitude.toFixed(4)}, ${latest.gps.longitude.toFixed(4)}` : null;

  // IMU
  const accel = latest?.imu?.accelerometer_g
    ? `X: ${latest.imu.accelerometer_g.x.toFixed(2)} Y: ${latest.imu.accelerometer_g.y.toFixed(2)} Z: ${latest.imu.accelerometer_g.z.toFixed(2)}`
    : null;

  // Radio Link
  const rssi = latest?.receiver_rssi != null ? `${latest.receiver_rssi.toFixed(1)}` : null;
  const snr = latest?.receiver_snr != null ? `${latest.receiver_snr.toFixed(1)}` : null;

  const uptime = latest?.uptime_seconds != null ? `${latest.uptime_seconds}s` : null;
  const seq = latest?.packet_sequence != null ? `#${latest.packet_sequence}` : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="body2" fontWeight={700}>
          Subsystem Health & Live Metrics
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            label={seq ? `Seq ${seq}` : 'Waiting for packets'}
            color={seq ? 'primary' : 'default'}
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
          {uptime && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              Uptime: {uptime}
            </Typography>
          )}
        </Stack>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto' }}>
        <Grid container spacing={1.5}>
          {/* Main Bus Rails */}
          <Grid item xs={12} sm={6} md={3}>
            <RascubeMetricCard
              title="Main 5V / 3.3V Rails"
              value={v5 ? `${v5} / ${v33}` : null}
              unit="V"
              subtitle={v5 ? `5V Rail: ${v5}V | 3.3V Rail: ${v33}V` : 'EPS Bus Regulator'}
              icon={<ElectricBoltIcon fontSize="small" />}
              status={v5 && Number(v5) > 4.5 ? 'success' : 'normal'}
            />
          </Grid>

          {/* Battery Status */}
          <Grid item xs={12} sm={6} md={3}>
            <RascubeMetricCard
              title="Battery Charge"
              value={vbat}
              unit="V"
              subtitle={ibat ? `Current: ${ibat} mA` : 'Li-Ion Battery Pack'}
              icon={<BatteryChargingFullIcon fontSize="small" />}
              status={vbat && Number(vbat) > 3.7 ? 'success' : 'warning'}
            />
          </Grid>

          {/* Environment */}
          <Grid item xs={12} sm={6} md={3}>
            <RascubeMetricCard
              title="Temperature & Pres"
              value={temp}
              unit="°C"
              subtitle={pres ? `${pres} hPa | Alt: ${alt}m` : 'Barometer Sensor'}
              icon={<ThermostatIcon fontSize="small" />}
              status="normal"
            />
          </Grid>

          {/* GPS Location */}
          <Grid item xs={12} sm={6} md={3}>
            <RascubeMetricCard
              title="GPS Navigation"
              value={hasFix ? '3D FIX' : 'NO FIX'}
              subtitle={hasFix ? `${coords} (${sats} sats)` : `Tracking (${sats} satellites)`}
              icon={<MyLocationIcon fontSize="small" />}
              status={hasFix ? 'success' : 'warning'}
            />
          </Grid>

          {/* IMU Accelerometer */}
          <Grid item xs={12} sm={6} md={6}>
            <RascubeMetricCard
              title="IMU Accelerometer (X, Y, Z)"
              value={accel ?? '-'}
              unit="g"
              subtitle="Tri-axial MEMS Accelerometer"
              icon={<SpeedIcon fontSize="small" />}
              status="normal"
            />
          </Grid>

          {/* Radio Signal */}
          <Grid item xs={12} sm={6} md={6}>
            <RascubeMetricCard
              title="Radio Reception Link"
              value={rssi}
              unit="dBm"
              subtitle={snr ? `Signal-to-Noise Ratio (SNR): ${snr} dB` : 'LoRa / FSK Receiver'}
              icon={<SignalCellularAltIcon fontSize="small" />}
              status={rssi && Number(rssi) > -90 ? 'success' : 'warning'}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
