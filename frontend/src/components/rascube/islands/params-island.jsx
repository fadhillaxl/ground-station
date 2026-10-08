import React from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ListAltIcon from '@mui/icons-material/ListAlt';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';

function ParamRow({ label, value, unit = '' }) {
  return (
    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 }, py: 0.25 }}>
      <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem', color: 'text.secondary' }}>{label}</TableCell>
      <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}>
        {value ?? '-'} {unit && <span style={{ opacity: 0.7 }}>{unit}</span>}
      </TableCell>
    </TableRow>
  );
}

export default function RascubeParamsIsland({ gridEditable = false }) {
  const latest = useSelector((state) => state.rascube?.latestTelemetry);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListAltIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Decoded Telemetry Parameters
          </Typography>
        </Box>
      </TitleBar>

      <Box sx={{ p: 1, flex: 1, overflowY: 'auto' }}>
        {/* EPS Section */}
        <Accordion defaultExpanded sx={{ bgcolor: 'background.paper', mb: 1, borderRadius: '8px !important' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, py: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              EPS & Power Subsystems
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0.5 }}>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  <ParamRow label="Main 5V Rail" value={latest?.eps?.main_5v_v?.toFixed(3)} unit="V" />
                  <ParamRow label="Main 3.3V Rail" value={latest?.eps?.main_3v3_v?.toFixed(3)} unit="V" />
                  <ParamRow label="Battery Voltage" value={latest?.eps?.battery_charge?.bus_voltage_v?.toFixed(3)} unit="V" />
                  <ParamRow label="Battery Charge Current" value={latest?.eps?.battery_charge?.current_a?.toFixed(3)} unit="A" />
                  <ParamRow label="Battery Draw Current" value={latest?.eps?.battery_draw?.current_a?.toFixed(3)} unit="A" />
                  <ParamRow label="USB Bus Voltage" value={latest?.eps?.usb?.bus_voltage_v?.toFixed(3)} unit="V" />
                  <ParamRow label="Charging Complete" value={latest?.eps?.charging_complete ? 'YES' : 'NO'} />
                  <ParamRow label="Charge Power Good" value={latest?.eps?.charge_power_good ? 'YES' : 'NO'} />
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>

        {/* IMU Section */}
        <Accordion defaultExpanded sx={{ bgcolor: 'background.paper', mb: 1, borderRadius: '8px !important' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, py: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              IMU & Attitude Sensors
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0.5 }}>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  <ParamRow label="Accel X / Y / Z" value={latest?.imu?.accelerometer_g ? `${latest.imu.accelerometer_g.x.toFixed(2)}, ${latest.imu.accelerometer_g.y.toFixed(2)}, ${latest.imu.accelerometer_g.z.toFixed(2)}` : null} unit="g" />
                  <ParamRow label="Gyro X / Y / Z" value={latest?.imu?.gyroscope_dps ? `${latest.imu.gyroscope_dps.x.toFixed(2)}, ${latest.imu.gyroscope_dps.y.toFixed(2)}, ${latest.imu.gyroscope_dps.z.toFixed(2)}` : null} unit="dps" />
                  <ParamRow label="Mag X / Y / Z" value={latest?.imu?.magnetometer_gauss ? `${latest.imu.magnetometer_gauss.x.toFixed(2)}, ${latest.imu.magnetometer_gauss.y.toFixed(2)}, ${latest.imu.magnetometer_gauss.z.toFixed(2)}` : null} unit="G" />
                  <ParamRow label="Orientation (Roll, Pitch, Yaw)" value={latest?.imu?.orientation_degrees ? `${latest.imu.orientation_degrees.x.toFixed(1)}°, ${latest.imu.orientation_degrees.y.toFixed(1)}°, ${latest.imu.orientation_degrees.z.toFixed(1)}°` : null} />
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>

        {/* GPS Section */}
        <Accordion sx={{ bgcolor: 'background.paper', mb: 1, borderRadius: '8px !important' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, py: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              GPS & Navigation
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0.5 }}>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  <ParamRow label="Fix Status" value={latest?.gps?.fix ? 'VALID 3D FIX' : 'NO FIX'} />
                  <ParamRow label="Satellites in View" value={latest?.gps?.satellites} />
                  <ParamRow label="Latitude" value={latest?.gps?.latitude?.toFixed(6)} unit="°" />
                  <ParamRow label="Longitude" value={latest?.gps?.longitude?.toFixed(6)} unit="°" />
                  <ParamRow label="Altitude" value={latest?.gps?.altitude_m?.toFixed(1)} unit="m" />
                  <ParamRow label="Speed" value={latest?.gps?.speed_raw?.toFixed(2)} unit="m/s" />
                  <ParamRow label="HDOP" value={latest?.gps?.hdop?.toFixed(2)} />
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}
