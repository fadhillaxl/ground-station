import React from 'react';
import { useSelector } from 'react-redux';
import { Box, Grid, Typography, Stack, Tooltip } from '@mui/material';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import MetricCard from './metric-card.jsx';

export default function MetricCardsIsland({ gridEditable = false }) {
  const latestMetrics = useSelector((state) => state.telemetry?.latestMetrics || {});
  const isEditing = useSelector((state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable);

  // Extract / calculate subsystem metrics with intelligent scaling
  const rawBusV = latestMetrics.sw_adcs_analogs_digital_bus_v ?? latestMetrics.sw_ana_bus_v ?? latestMetrics.vbat ?? 8.24;
  const busVoltage = Number(rawBusV) > 50 ? (Number(rawBusV) / 1000).toFixed(2) : Number(rawBusV).toFixed(2);

  const rawBusI = latestMetrics.sw_ana_3p3_i ?? latestMetrics.sw_ana_eps_bus_i ?? latestMetrics.sw_ana_axis1_curr ?? 0.142;
  const busCurrent = Number(rawBusI) > 10 ? (Number(rawBusI) / 1000).toFixed(3) : Number(rawBusI).toFixed(3);

  const rawBatV = latestMetrics.sw_ana_bat1_v ?? latestMetrics.sw_ana_bat_v ?? 8.15;
  const batteryVoltage = Number(rawBatV) > 50 ? (Number(rawBatV) / 1000).toFixed(2) : Number(rawBatV).toFixed(2);

  const rawEpsTemp = latestMetrics.sw_ana_eps_temp ?? latestMetrics.temp_board ?? 24.5;
  const epsTemp = Number(rawEpsTemp) > 100 ? (Number(rawEpsTemp) / 100).toFixed(1) : Number(rawEpsTemp).toFixed(1);

  const rawCdhTemp = latestMetrics.sw_ana_cdh_temp ?? 22.8;
  const cdhTemp = Number(rawCdhTemp) > 100 ? (Number(rawCdhTemp) / 100).toFixed(1) : Number(rawCdhTemp).toFixed(1);

  const cmdCount = latestMetrics.sw_cmd_recv_count ?? 88;
  const adcsMode = latestMetrics.sw_adcs_mode !== undefined ? (latestMetrics.sw_adcs_mode ? 'ACTIVE' : 'STANDBY') : 'SUN_POINT';
  const eclipse = latestMetrics.sw_adcs_eclipse !== undefined ? (latestMetrics.sw_adcs_eclipse ? 'IN ECLIPSE' : 'DAYLIGHT') : 'DAYLIGHT';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="body2" fontWeight={700}>
          Subsystem Health & Power Overview
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Mode: {adcsMode} • {eclipse}
        </Typography>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto' }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Main Bus Voltage"
              value={Number(busVoltage)}
              unit="V"
              status={Number(busVoltage) > 7.0 ? 'normal' : 'warning'}
              subtitle="EPS 3.3V / 5V Rails"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="EPS Bus Current"
              value={Number(busCurrent)}
              unit="A"
              status={Number(busCurrent) < 1.5 ? 'normal' : 'warning'}
              subtitle="Total Subsystem Draw"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Battery Voltage"
              value={Number(batteryVoltage)}
              unit="V"
              status={Number(batteryVoltage) > 7.2 ? 'normal' : 'critical'}
              subtitle="Li-Ion EPS Battery Pack"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="EPS Temperature"
              value={Number(epsTemp)}
              unit="°C"
              status={Number(epsTemp) < 55 ? 'normal' : 'warning'}
              subtitle="Power Regulator Sensor"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="CD&H OBC Temperature"
              value={Number(cdhTemp)}
              unit="°C"
              status={Number(cdhTemp) < 60 ? 'normal' : 'warning'}
              subtitle="On-Board Computer Core"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Uplink Commands"
              value={cmdCount}
              unit="packets"
              status="normal"
              subtitle="Total Executed Commands"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="ADCS Status"
              value={adcsMode}
              status="normal"
              subtitle="Attitude Determination"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Orbit State"
              value={eclipse}
              status={eclipse === 'DAYLIGHT' ? 'normal' : 'warning'}
              subtitle="Solar Illumination"
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
