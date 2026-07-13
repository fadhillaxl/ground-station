import React, { useEffect, useState } from 'react';
import { Box, Grid, Paper, FormControl, InputLabel, Select, MenuItem, Stack, Typography } from '@mui/material';
import { useSocket } from '../common/socket.jsx';
import SignalInfo from './SignalInfo.jsx';
import Constellation from './Constellation.jsx';
import ImageCanvas from './ImageCanvas.jsx';
import { useSelector } from 'react-redux';
import { Satellite as SatelliteIcon } from '@mui/icons-material';
import { getFlattenedTasks } from '../scheduler/session-utils.js';

// Color enhancement filters for canvas overlay
const COLOR_PALETTES = {
  default: { name: 'Normal (Visible)', filter: 'none' },
  grayscale: { name: 'Grayscale', filter: 'grayscale(1)' },
  contrast: { name: 'High Contrast', filter: 'contrast(1.4) brightness(0.95)' },
  thermal: { name: 'Thermal IR (False Color)', filter: 'invert(1) hue-rotate(180deg) saturate(1.8)' },
  infrared: { name: 'Infrared lookup', filter: 'contrast(1.2) sepia(0.8) hue-rotate(290deg) saturate(1.5)' }
};

export default function WeatherViewer({ decoderId }) {
  const { socket } = useSocket();
  const observations = useSelector((state) => state.scheduler?.observations || []);

  // Determine active decoder ID (either passed directly or derived from active running observation)
  const resolvedDecoderId = React.useMemo(() => {
    if (decoderId) return decoderId;

    const activeObs = observations.find((obs) => {
      if (obs.status !== 'running') return false;
      const tasks = getFlattenedTasks(obs);
      return tasks.some((t) => t.type === 'weather_decoder');
    });
    return activeObs?.id || null;
  }, [decoderId, observations]);

  const [signalData, setSignalData] = useState({
    snr: 0.0,
    peak_snr: 0.0,
    freq_offset: 0.0,
    viterbi_lock: false,
    deframer_lock: false,
    rs_errors: 0,
    ber: 0.0,
    constellation: []
  });
  const [imageUpdate, setImageUpdate] = useState(null);
  const [selectedPalette, setSelectedPalette] = useState('default');

  useEffect(() => {
    if (!socket || !resolvedDecoderId) return;

    // Connect socket listeners for weather live events
    const handleSignalUpdate = (packet) => {
      if (packet && packet.decoder_id === resolvedDecoderId) {
        setSignalData(packet.data);
      }
    };

    const handleImageUpdate = (packet) => {
      if (packet && packet.decoder_id === resolvedDecoderId) {
        setImageUpdate(packet);
      }
    };

    socket.on('weather_signal', handleSignalUpdate);
    socket.on('weather_image_update', handleImageUpdate);

    return () => {
      socket.off('weather_signal', handleSignalUpdate);
      socket.off('weather_image_update', handleImageUpdate);
    };
  }, [socket, resolvedDecoderId]);

  if (!resolvedDecoderId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 120px)', minHeight: 600, p: 3, width: '100%' }}>
        <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center', background: 'rgba(30, 30, 40, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <SatelliteIcon sx={{ fontSize: 60, color: 'primary.main' }} />
          <Typography variant="h5" fontWeight="bold" sx={{ color: 'text.primary' }}>
            No Live Weather Decoding Active
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No live geostationary weather satellite decoding session is currently running. Please schedule or trigger a scheduled observation with a "Weather Decoder" task to watch real-time progressive images here.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 2, height: 'calc(100vh - 120px)', minHeight: 600, display: 'flex', flexDirection: 'column' }}>
      <Grid container spacing={3} sx={{ height: '100%', flex: 1 }}>
        
        {/* Left column: Diagnostics & Controls */}
        <Grid item xs={12} md={4} lg={3.5} sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%', overflowY: 'auto' }}>
          
          {/* Signal Quality Panel */}
          <SignalInfo signalData={signalData} />

          {/* Constellation Diagram */}
          <Constellation points={signalData.constellation} />

          {/* Image Enhancements */}
          <Paper sx={{ p: 2, background: 'rgba(30, 30, 40, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold', mb: 2 }}>
              Enhancement Palettes
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="palette-select-label">Select Look/Color filter</InputLabel>
              <Select
                labelId="palette-select-label"
                value={selectedPalette}
                label="Select Look/Color filter"
                onChange={(e) => setSelectedPalette(e.target.value)}
              >
                {Object.entries(COLOR_PALETTES).map(([key, val]) => (
                  <MenuItem key={key} value={key}>{val.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Paper>

        </Grid>

        {/* Right column: Main Image Canvas */}
        <Grid item xs={12} md={8} lg={8.5} sx={{ height: '100%', display: 'flex' }}>
          <Paper
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(20, 20, 25, 0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 3,
              overflow: 'hidden',
              height: '100%'
            }}
          >
            <ImageCanvas 
              imageUpdate={imageUpdate} 
              filterStyle={COLOR_PALETTES[selectedPalette].filter} 
            />
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
}
