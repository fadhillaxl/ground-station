import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import UsbIcon from '@mui/icons-material/Usb';
import UsbOffIcon from '@mui/icons-material/UsbOff';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import {
  setSerialNumber,
  setBaudRate,
  setGridEditable,
} from './rascube-slice.jsx';

export default function RascubeTopBar({
  webSerial,
  onResetLayout,
}) {
  const dispatch = useDispatch();
  const { isConnected, serialNumber, baudRate, gridEditable } = useSelector(
    (state) => state.rascube
  );

  const [localSat, setLocalSat] = useState(serialNumber || 1581);
  const [localBaud, setLocalBaud] = useState(baudRate || 1000000);
  const [connError, setConnError] = useState(null);

  const handleToggleConnect = async () => {
    setConnError(null);
    if (isConnected) {
      await webSerial.disconnect();
    } else {
      try {
        await webSerial.connect({
          serialNumber: Number(localSat),
          baudRate: Number(localBaud),
        });
      } catch (err) {
        setConnError(err.message || 'Web Serial connection failed');
      }
    }
  };

  const handleSatChange = (e) => {
    const val = Number(e.target.value);
    setLocalSat(val);
    dispatch(setSerialNumber(val));
  };

  const handleBaudChange = (e) => {
    const val = Number(e.target.value);
    setLocalBaud(val);
    dispatch(setBaudRate(val));
  };

  const isSecure =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  return (
    <Box sx={{ mb: 1.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        {/* Left: Brand & Connection Status */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SatelliteAltIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.2 }}>
              RASCube Satellite Operations
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Client Web USB / Serial Ground Station Interface
            </Typography>
          </Box>

          <Chip
            size="small"
            icon={isConnected ? <UsbIcon /> : <UsbOffIcon />}
            label={isConnected ? `Connected (Sat #${serialNumber})` : 'Disconnected'}
            color={isConnected ? 'success' : 'default'}
            sx={{ fontWeight: 600, px: 0.5 }}
          />
        </Stack>

        {/* Right: Controls & Layout Tools */}
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            label="Satellite ID"
            type="number"
            disabled={isConnected}
            value={localSat}
            onChange={handleSatChange}
            sx={{ width: 120 }}
          />

          <TextField
            size="small"
            label="Baud Rate"
            type="number"
            disabled={isConnected}
            value={localBaud}
            onChange={handleBaudChange}
            sx={{ width: 120 }}
          />

          <Button
            variant="contained"
            color={isConnected ? 'error' : 'primary'}
            startIcon={isConnected ? <UsbOffIcon /> : <UsbIcon />}
            onClick={handleToggleConnect}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {isConnected ? 'Disconnect USB' : 'Connect Browser USB'}
          </Button>

          {/* Grid Layout Lock / Edit */}
          <Tooltip title={gridEditable ? 'Lock Grid Layout' : 'Unlock & Edit Grid Layout'}>
            <Button
              variant="outlined"
              size="small"
              startIcon={gridEditable ? <LockOpenIcon /> : <LockIcon />}
              onClick={() => dispatch(setGridEditable(!gridEditable))}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {gridEditable ? 'Done Editing' : 'Edit Layout'}
            </Button>
          </Tooltip>

          {/* Reset Layout */}
          <Tooltip title="Reset Dashboard Layout to Default">
            <IconButton size="small" onClick={onResetLayout}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Warnings & Errors */}
      {connError && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setConnError(null)}>
          {connError}
        </Alert>
      )}

      {!isSecure && !webSerial.isSupported && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          🔒 <strong>Secure Context Required</strong>: Web Serial API requires HTTPS or localhost. If accessing via IP, enable Chrome flag: <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> and add your origin.
        </Alert>
      )}
    </Box>
  );
}
