import React, { useEffect, useState, useRef } from 'react';
import { Box, Grid, Paper, FormControl, InputLabel, Select, MenuItem, Stack, Typography } from '@mui/material';
import { useSocket } from '../common/socket.jsx';
import SignalInfo from './SignalInfo.jsx';
import Constellation from './Constellation.jsx';
import ImageCanvas from './ImageCanvas.jsx';
import { useSelector } from 'react-redux';
import { Satellite as SatelliteIcon, Terminal as TerminalIcon } from '@mui/icons-material';
import { getFlattenedTasks } from '../scheduler/session-utils.js';
import SpectrumVisualizer from './SpectrumVisualizer.jsx';

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
      if (obs.status !== 'running' && obs.status !== 'completed') return false;
      const tasks = getFlattenedTasks(obs);
      return tasks.some((t) => t.type === 'weather_decoder');
    });
    return activeObs?.id || null;
  }, [decoderId, observations]);

  // Extract initial SDR config parameters for the spectrum visualizer
  const { initialFrequency, initialGain, sampleRate } = React.useMemo(() => {
    const activeObs = observations.find((obs) => obs.id === resolvedDecoderId);
    const sdrConfig = activeObs?.sessions?.[0]?.sdr || {};
    return {
      initialFrequency: sdrConfig.frequency_hz || sdrConfig.center_frequency || 1692.14e6,
      initialGain: sdrConfig.gain || 49,
      sampleRate: sdrConfig.sample_rate || 2.048e6
    };
  }, [resolvedDecoderId, observations]);

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
  const [logs, setLogs] = useState([]);
  
  const consoleRef = useRef(null);

  useEffect(() => {
    console.log("WeatherViewer useEffect active. resolvedDecoderId:", resolvedDecoderId);
    if (!socket || !resolvedDecoderId) return;

    // Fetch initial log lines
    socket.emit("api.call", {
      cmd: 'get-weather-logs',
      data: { decoder_id: resolvedDecoderId }
    }, (response) => {
      if (response && response.success && Array.isArray(response.data)) {
        setLogs(response.data);
      }
    });

    // Connect socket listeners for weather live events
    const handleSignalUpdate = (packet) => {
      console.log("handleSignalUpdate packet received:", packet);
      if (packet && packet.decoder_id === resolvedDecoderId) {
        console.log("Setting signalData:", packet.data);
        setSignalData(packet.data);
      }
    };

    const handleImageUpdate = (packet) => {
      console.log("handleImageUpdate packet received:", packet);
      if (packet && packet.decoder_id === resolvedDecoderId) {
        setImageUpdate(packet);
      }
    };

    const handleNewLog = (packet) => {
      if (packet && packet.decoder_id === resolvedDecoderId) {
        setLogs((prev) => {
          const next = [...prev, packet];
          if (next.length > 500) {
            next.shift();
          }
          return next;
        });
      }
    };

    socket.on('weather_signal', handleSignalUpdate);
    socket.on('weather_image_update', handleImageUpdate);
    socket.on('weather.log', handleNewLog);

    return () => {
      console.log("Cleaning up WeatherViewer socket listeners");
      socket.off('weather_signal', handleSignalUpdate);
      socket.off('weather_image_update', handleImageUpdate);
      socket.off('weather.log', handleNewLog);
    };
  }, [socket, resolvedDecoderId]);

  // Auto-scroll to bottom of console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  if (!resolvedDecoderId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 120px)', minHeight: 600, p: 3, width: '100%' }}>
        <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
        <Grid size={{ xs: 12, md: 4, lg: 3.5 }} sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%', overflowY: 'auto' }}>
          
          {/* Signal Quality Panel */}
          <SignalInfo signalData={signalData} />

          {/* Constellation Diagram */}
          <Constellation points={signalData.constellation} />

          {/* Image Enhancements */}
          <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, flexShrink: 0 }}>
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

          {/* Live CLI Logs Console */}
          <Paper 
            sx={{ 
              p: 2, 
              border: '1px solid', 
              borderColor: 'divider', 
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0c0c0d',
              color: '#f0f0f0',
              flexShrink: 0
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1, color: '#39ff14' }}>
                <TerminalIcon fontSize="small" /> SatDump CLI Logs
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  cursor: 'pointer', 
                  color: '#888', 
                  '&:hover': { color: '#ccc' } 
                }}
                onClick={() => setLogs([])}
              >
                Clear
              </Typography>
            </Box>
            <Box 
              ref={consoleRef}
              sx={{ 
                height: 200, 
                overflowY: 'auto', 
                fontFamily: 'monospace', 
                fontSize: '0.70rem', 
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                backgroundColor: '#18181a',
                p: 1,
                borderRadius: 1,
                border: '1px solid #2d2d30'
              }}
            >
              {logs.length === 0 ? (
                <Typography variant="caption" sx={{ color: '#666', fontStyle: 'italic', fontFamily: 'monospace' }}>
                  Waiting for SatDump output logs...
                </Typography>
              ) : (
                logs.map((log, idx) => (
                  <Box 
                    key={idx} 
                    sx={{ 
                      color: log.stream === 'stderr' ? '#ff6b6b' : '#39ff14',
                      mb: 0.5 
                    }}
                  >
                    <span style={{ color: '#666', marginRight: 8 }}>
                      {log.timestamp ? new Date(log.timestamp * 1000).toLocaleTimeString() : ''}
                    </span>
                    {log.message}
                  </Box>
                ))
              )}
            </Box>
          </Paper>

        </Grid>

        {/* Right column: Main Image Canvas & FFT Spectrum */}
        <Grid size={{ xs: 12, md: 8, lg: 8.5 }} sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Paper
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              overflow: 'hidden',
              height: '60%'
            }}
          >
            <ImageCanvas 
              imageUpdate={imageUpdate} 
              filterStyle={COLOR_PALETTES[selectedPalette].filter} 
            />
          </Paper>

          {/* Real-time spectrum & waterfall visualization */}
          <SpectrumVisualizer 
            decoderId={resolvedDecoderId} 
            initialFrequency={initialFrequency} 
            initialGain={initialGain} 
            sampleRate={sampleRate} 
          />
        </Grid>

      </Grid>
    </Box>
  );
}
