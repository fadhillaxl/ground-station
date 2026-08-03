import React, { useEffect, useState, useRef } from 'react';
import { Box, Paper, Grid, Slider, FormControl, InputLabel, Select, MenuItem, Stack, Typography, TextField, Button, IconButton } from '@mui/material';
import { useSocket } from '../common/socket.jsx';
import { Settings as SettingsIcon, Tune as TuneIcon, Refresh as RefreshIcon } from '@mui/icons-material';

// Classic plasma/viridis-like color scale for waterfall
const WATERFALL_COLORS = [];
for (let i = 0; i < 256; i++) {
  // Deep purple/blue -> Cyan -> Green -> Orange -> Yellow -> White
  const r = Math.floor(Math.max(0, Math.min(255, (i - 100) * 3)));
  const g = Math.floor(Math.max(0, Math.min(255, (i - 50) * 2)));
  const b = Math.floor(Math.max(0, Math.min(255, i < 150 ? i * 1.5 : 255 - (i - 150) * 2)));
  WATERFALL_COLORS.push(`rgb(${r}, ${g}, ${b})`);
}

export default function SpectrumVisualizer({ decoderId, initialFrequency = 1692.14e6, initialGain = 49, sampleRate = 2.048e6 }) {
  const { socket } = useSocket();

  // Settings states
  const [gain, setGain] = useState(initialGain);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [fftSize, setFftSize] = useState(1024);
  const [fftFps, setFftFps] = useState(15);
  
  // Custom Fine Tuning Offset (in Hz)
  const [freqOffset, setFreqOffset] = useState(0);

  // Canvas Refs
  const fftCanvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);
  const waterfallBufferCanvasRef = useRef(null);

  // Maintain internal tuning state to throttle socket updates
  const updateTimeoutRef = useRef(null);

  // Handle socket reconfiguration
  const sendConfigUpdate = (params) => {
    if (!socket || !decoderId) return;
    
    socket.emit("api.call", {
      cmd: "configure-weather-fft",
      data: {
        decoder_id: decoderId,
        ...params
      }
    }, (res) => {
      if (res && res.success) {
        console.log("Successfully reconfigured weather FFT:", params);
      } else {
        console.error("Failed to reconfigure weather FFT:", res?.error);
      }
    });
  };

  // Debounced tune updates
  const triggerDebouncedConfig = (params) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      sendConfigUpdate(params);
    }, 150);
  };

  // Handle Gain Change
  const handleGainChange = (e, val) => {
    setGain(val);
    triggerDebouncedConfig({ gain: val });
  };

  // Handle Frequency Tuning
  const handleFreqChange = (newFreq) => {
    setFrequency(newFreq);
    triggerDebouncedConfig({ frequency_hz: newFreq });
  };

  // Handle Fine Tuning Offset Slider
  const handleOffsetChange = (e, val) => {
    setFreqOffset(val);
    const targetFreq = frequency + val;
    triggerDebouncedConfig({ frequency_hz: targetFreq });
  };

  // Handle FFT Size Change
  const handleFftSizeChange = (e) => {
    const size = e.target.value;
    setFftSize(size);
    sendConfigUpdate({ fft_size: size });
  };

  // Handle FFT FPS Change
  const handleFftFpsChange = (e) => {
    const fps = e.target.value;
    setFftFps(fps);
    sendConfigUpdate({ fft_fps: fps });
  };

  // Clean up timers
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Listen to live FFT data socket event
  useEffect(() => {
    if (!socket || !decoderId) return;

    // Send initial configuration parameters to proxy
    sendConfigUpdate({
      fft_size: fftSize,
      fft_fps: fftFps,
      gain: gain,
      frequency_hz: frequency + freqOffset
    });

    const handleFftData = (packet) => {
      if (packet && packet.decoder_id === decoderId && Array.isArray(packet.fft)) {
        renderFrame(packet.fft);
      }
    };

    socket.on('weather_fft', handleFftData);
    return () => {
      socket.off('weather_fft', handleFftData);
    };
  }, [socket, decoderId, fftSize, fftFps]);

  // Main rendering loop (Spectrum & Waterfall draw)
  const renderFrame = (fftData) => {
    const fftCanvas = fftCanvasRef.current;
    const waterfallCanvas = waterfallCanvasRef.current;
    if (!fftCanvas || !waterfallCanvas) return;

    const width = fftCanvas.width;
    const height = fftCanvas.height;

    // --- 1. Render FFT Spectrum Line ---
    const ctx = fftCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      // Horizontal dB lines
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Vertical Frequency lines
      const x = (width / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Plot Spectrum Curve
    ctx.beginPath();
    const len = fftData.length;
    for (let i = 0; i < len; i++) {
      const db = fftData[i];
      // Map dB range [-85, 5] to canvas coordinates
      const val = (db + 85) / 90; // normalize to [0, 1]
      const x = (i / (len - 1)) * width;
      const y = height - (val * height);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    // Glow Effect
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Semi-transparent area fill under curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 243, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 243, 255, 0.00)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw scale text
    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.fillText('0 dB', 5, 12);
    ctx.fillText('-40 dB', 5, height / 2 + 3);
    ctx.fillText('-80 dB', 5, height - 8);

    // Frequency labels (MHz)
    const centerMHz = (frequency + freqOffset) / 1e6;
    const spanMHz = sampleRate / 1e6;
    ctx.fillText(`${(centerMHz - spanMHz / 2).toFixed(3)} MHz`, 5, height - 8);
    ctx.fillText(`${centerMHz.toFixed(3)} MHz`, width / 2 - 25, height - 8);
    ctx.fillText(`${(centerMHz + spanMHz / 2).toFixed(3)} MHz`, width - 75, height - 8);

    // --- 2. Render Scrolling Waterfall ---
    const wfCtx = waterfallCanvas.getContext('2d');
    const wfWidth = waterfallCanvas.width;
    const wfHeight = waterfallCanvas.height;

    // Shift waterfall down by 1.5 pixels
    const shiftY = 2;
    wfCtx.drawImage(waterfallCanvas, 0, 0, wfWidth, wfHeight - shiftY, 0, shiftY, wfWidth, wfHeight - shiftY);

    // Render the new row of color values
    const tempCanvas = waterfallBufferCanvasRef.current || document.createElement('canvas');
    tempCanvas.width = len;
    tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d');
    const imgData = tempCtx.createImageData(len, 1);

    for (let i = 0; i < len; i++) {
      const db = fftData[i];
      // Normalize to index [0, 255]
      const normVal = Math.floor(Math.max(0, Math.min(255, ((db + 80) / 75) * 255)));
      
      // Parse colors from helper list
      const r = Math.floor(Math.max(0, Math.min(255, (normVal - 100) * 3)));
      const g = Math.floor(Math.max(0, Math.min(255, (normVal - 50) * 2)));
      const b = Math.floor(Math.max(0, Math.min(255, normVal < 150 ? normVal * 1.5 : 255 - (normVal - 150) * 2)));

      const idx = i * 4;
      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
    tempCtx.putImageData(imgData, 0, 0);

    // Draw the newly scaled row to the waterfall top
    wfCtx.drawImage(tempCanvas, 0, 0, len, 1, 0, 0, wfWidth, shiftY);
  };

  return (
    <Paper 
      sx={{ 
        p: 2, 
        border: '1px solid', 
        borderColor: 'divider', 
        borderRadius: 3, 
        backgroundColor: 'background.paper',
        background: 'rgba(255, 255, 255, 0.02)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
        display: 'flex', 
        flexDirection: 'column', 
        gap: 2,
        height: 300,
        flexShrink: 0
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ color: 'primary.main', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon /> Real-time Spectrum / Waterfall
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          SDR: {sampleRate / 1e6} MSPS
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ flexGrow: 1, minHeight: 0 }}>
        {/* Spectrum Canvas */}
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5 }}>FFT RF Spectrum</Typography>
          <Box sx={{ flexGrow: 1, backgroundColor: '#0a0a0c', borderRadius: 2, overflow: 'hidden', border: '1px solid #1c1c1f', minHeight: 100 }}>
            <canvas 
              ref={fftCanvasRef} 
              width={600} 
              height={140} 
              style={{ width: '100%', height: '100%', display: 'block' }} 
            />
          </Box>
        </Grid>

        {/* Waterfall Canvas */}
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5 }}>Signal History (Waterfall)</Typography>
          <Box sx={{ flexGrow: 1, backgroundColor: '#0a0a0c', borderRadius: 2, overflow: 'hidden', border: '1px solid #1c1c1f', minHeight: 100 }}>
            <canvas 
              ref={waterfallCanvasRef} 
              width={600} 
              height={140} 
              style={{ width: '100%', height: '100%', display: 'block' }} 
            />
          </Box>
        </Grid>
      </Grid>

      {/* Interactive Controls Row */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
        <Grid container spacing={3} alignItems="center">
          {/* Fine Tuning offset */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between' }}>
              <span>Fine Tuning Offset</span>
              <span style={{ color: '#00f3ff', fontWeight: 'bold' }}>{freqOffset > 0 ? '+' : ''}{(freqOffset / 1e3).toFixed(1)} kHz</span>
            </Typography>
            <Slider
              size="small"
              value={freqOffset}
              min={-150000}
              max={150000}
              step={100}
              onChange={handleOffsetChange}
              valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v / 1000}kHz`}
              valueLabelDisplay="auto"
              sx={{ color: '#00f3ff' }}
            />
          </Grid>

          {/* Gain slider */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between' }}>
              <span>SDR Hardware Gain</span>
              <span style={{ color: 'primary.main', fontWeight: 'bold' }}>{gain} dB</span>
            </Typography>
            <Slider
              size="small"
              value={gain}
              min={0}
              max={50}
              step={1}
              onChange={handleGainChange}
              valueLabelDisplay="auto"
            />
          </Grid>

          {/* FFT Options */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="fft-size-label">FFT Resolution</InputLabel>
                <Select
                  labelId="fft-size-label"
                  value={fftSize}
                  label="FFT Resolution"
                  onChange={handleFftSizeChange}
                >
                  <MenuItem value={512}>512 Bins</MenuItem>
                  <MenuItem value={1024}>1024 Bins</MenuItem>
                  <MenuItem value={2048}>2048 Bins</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel id="fft-fps-label">FPS Rate</InputLabel>
                <Select
                  labelId="fft-fps-label"
                  value={fftFps}
                  label="FPS Rate"
                  onChange={handleFftFpsChange}
                >
                  <MenuItem value={5}>5 FPS</MenuItem>
                  <MenuItem value={10}>10 FPS</MenuItem>
                  <MenuItem value={15}>15 FPS (Default)</MenuItem>
                  <MenuItem value={30}>30 FPS</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}
