import React from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import SecurityIcon from '@mui/icons-material/Security';
import MemoryIcon from '@mui/icons-material/Memory';
import HighQualityIcon from '@mui/icons-material/HighQuality';
import RouterIcon from '@mui/icons-material/Router';
import HlsPlayer from './hls-player.jsx';

export default function CctvPage() {
  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 120px)' }}>
      {/* Header Section */}
      <Box sx={{ mb: 3 }}>
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

      {/* Main Grid Layout */}
      <Grid container spacing={3}>
        {/* Main CCTV Stream View */}
        <Grid size={{ xs: 12, lg: 9 }}>
          <HlsPlayer src="/cctv/index.m3u8" cameraName="Main Entrance" />
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
            <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon fontSize="small" /> Camera Metadata
            </Typography>

            <Divider />

            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Camera Name
                </Typography>
                <Typography variant="body2" fontWeight="600" color="text.primary">
                  Main Entrance Camera
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Stream Endpoint
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
                  /cctv/index.m3u8
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
    </Box>
  );
}
