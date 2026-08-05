import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Stack,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import SecurityIcon from '@mui/icons-material/Security';
import MemoryIcon from '@mui/icons-material/Memory';
import HighQualityIcon from '@mui/icons-material/HighQuality';
import RouterIcon from '@mui/icons-material/Router';
import SettingsIcon from '@mui/icons-material/Settings';
import HlsPlayer from './hls-player.jsx';

export default function CctvPage() {
  const [streamUrl, setStreamUrl] = useState(() => {
    return localStorage.getItem('groundstation_cctv_stream_url') || '/cctv/index.m3u8';
  });

  const [cameraName, setCameraName] = useState(() => {
    return localStorage.getItem('groundstation_cctv_camera_name') || 'Main Entrance';
  });

  const [openSettings, setOpenSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(streamUrl);
  const [tempName, setTempName] = useState(cameraName);

  useEffect(() => {
    setTempUrl(streamUrl);
  }, [streamUrl]);

  useEffect(() => {
    setTempName(cameraName);
  }, [cameraName]);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    const finalUrl = tempUrl.trim() || '/cctv/index.m3u8';
    const finalName = tempName.trim() || 'Main Entrance';

    setStreamUrl(finalUrl);
    setCameraName(finalName);

    localStorage.setItem('groundstation_cctv_stream_url', finalUrl);
    localStorage.setItem('groundstation_cctv_camera_name', finalName);

    setOpenSettings(false);
  };

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 120px)' }}>
      {/* Header Section */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
            <VideocamIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography variant="h4" fontWeight="bold" sx={{ color: 'text.primary' }}>
              CCTV Live Monitoring
            </Typography>
            <Chip
              icon={<SecurityIcon sx={{ fontSize: '1rem !important' }} />}
              label="Hikvision Security"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Real-time video feed from the ground station facility Hikvision camera stream.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          color="primary"
          startIcon={<SettingsIcon />}
          onClick={() => setOpenSettings(true)}
          sx={{ fontWeight: 'bold' }}
        >
          Configure Stream / IP
        </Button>
      </Box>

      {/* Main Grid Layout */}
      <Grid container spacing={3}>
        {/* Main CCTV Stream View */}
        <Grid size={{ xs: 12, lg: 9 }}>
          <HlsPlayer src={streamUrl} cameraName={cameraName} />
        </Grid>

        {/* Sidebar Stream Information & Status */}
        <Grid size={{ xs: 12, lg: 3 }}>
          <Paper
            elevation={2}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon fontSize="small" /> Camera Metadata
              </Typography>
              <Tooltip title="Configure Stream URL">
                <Button size="small" onClick={() => setOpenSettings(true)} sx={{ minWidth: 'auto', p: 0.5 }}>
                  <SettingsIcon fontSize="small" />
                </Button>
              </Tooltip>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Camera Name
                </Typography>
                <Typography variant="body2" fontWeight="600" color="text.primary">
                  {cameraName}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Stream Endpoint / IP
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    color: '#00f3ff',
                    backgroundColor: 'action.hover',
                    p: 0.75,
                    borderRadius: 1,
                    display: 'block',
                    wordBreak: 'break-all',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {streamUrl}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Transcoder Engine
                </Typography>
                <Chip
                  icon={<RouterIcon fontSize="small" />}
                  label="FFmpeg HLS Pipeline"
                  size="small"
                  sx={{ backgroundColor: 'action.selected', color: 'text.primary', fontWeight: 500 }}
                />
              </Box>

              <Divider />

              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <HighQualityIcon fontSize="small" /> Video Codec
                  </Typography>
                  <Typography variant="caption" fontWeight="600" color="text.primary">
                    H.264 / AAC
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <MemoryIcon fontSize="small" /> Latency Mode
                  </Typography>
                  <Typography variant="caption" fontWeight="600" color="success.main">
                    Low Latency HLS
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Stream Settings Dialog */}
      <Dialog open={openSettings} onClose={() => setOpenSettings(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveSettings}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Configure CCTV Camera Stream</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Camera Name"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                fullWidth
                required
                placeholder="e.g. Main Entrance"
                helperText="Display name overlay on top of the CCTV feed"
              />

              <TextField
                label="Camera Stream URL / IP Endpoint"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                fullWidth
                required
                placeholder="/cctv/index.m3u8 or http://192.168.1.100:8080/index.m3u8"
                helperText="Relative or absolute HLS stream URL generated from your camera RTSP/IP server"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenSettings(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              Save Settings
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
