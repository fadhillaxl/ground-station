import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Stack,
  Divider,
  Button,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import SecurityIcon from '@mui/icons-material/Security';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewComfyIcon from '@mui/icons-material/ViewComfy';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HlsPlayer from './hls-player.jsx';
import { useSocket } from '../common/socket.jsx';
import { fetchCameras, submitOrEditCamera, setOpenAddDialog } from '../hardware/camera-slice.jsx';

export default function CctvPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const camerasList = useSelector((state) => state.cameras?.list || []);
  const loading = useSelector((state) => state.cameras?.loading || false);

  const [layoutMode, setLayoutMode] = useState('auto'); // 'auto', '1x1', '2x2', '3x3'
  const [selectedCamId, setSelectedCamId] = useState(null);

  // Local state for Quick Add Camera dialog
  const [openQuickAdd, setOpenQuickAdd] = useState(false);
  const [newCam, setNewCam] = useState({
    name: '',
    url: '/cctv/index.m3u8',
    type: 'hls',
    status: 'active',
  });

  useEffect(() => {
    if (socket) {
      dispatch(fetchCameras({ socket }));
    }
  }, [dispatch, socket]);

  // Filter active cameras or fallback to default
  const activeCameras = camerasList.length > 0
    ? camerasList
    : [
        {
          id: 'default-1',
          name: localStorage.getItem('groundstation_cctv_camera_name') || 'Main Entrance',
          url: localStorage.getItem('groundstation_cctv_stream_url') || '/cctv/index.m3u8',
          type: 'hls',
          status: 'active',
        },
      ];

  // Determine displayed cameras based on focus mode or layout
  const displayedCameras = selectedCamId
    ? activeCameras.filter((c) => String(c.id) === String(selectedCamId))
    : activeCameras;

  // Grid column calculation
  const getGridItemSize = () => {
    if (selectedCamId || layoutMode === '1x1') return { xs: 12 };
    if (layoutMode === '2x2') return { xs: 12, md: 6 };
    if (layoutMode === '3x3') return { xs: 12, sm: 6, md: 4 };

    // Auto mode calculation
    const count = activeCameras.length;
    if (count <= 1) return { xs: 12 };
    if (count <= 4) return { xs: 12, md: 6 };
    return { xs: 12, sm: 6, md: 4 };
  };

  const handleSaveNewCamera = (e) => {
    e.preventDefault();
    if (!newCam.name || !newCam.url) return;
    dispatch(submitOrEditCamera({ socket, formValues: newCam }));
    setOpenQuickAdd(false);
    setNewCam({ name: '', url: '/cctv/index.m3u8', type: 'hls', status: 'active' });
  };

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 120px)' }}>
      {/* Header Section */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
            <VideocamIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography variant="h4" fontWeight="bold" sx={{ color: 'text.primary' }}>
              CCTV NVR Live Monitoring
            </Typography>
            <Chip
              icon={<SecurityIcon sx={{ fontSize: '1rem !important' }} />}
              label={`${activeCameras.length} Camera Feed${activeCameras.length > 1 ? 's' : ''}`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Multi-channel live security camera matrix & stream visualizer.
          </Typography>
        </Box>

        {/* NVR Control Toolbar */}
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          {selectedCamId && (
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              onClick={() => setSelectedCamId(null)}
              sx={{ fontWeight: 'bold' }}
            >
              Show All Streams
            </Button>
          )}

          {/* Grid Layout Selector */}
          <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: 'background.paper' }}>
            <Tooltip title="Single View (1x1)">
              <Button
                variant={layoutMode === '1x1' ? 'contained' : 'outlined'}
                onClick={() => {
                  setLayoutMode('1x1');
                  setSelectedCamId(null);
                }}
              >
                <CropSquareIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="2x2 Grid (4 Feeds)">
              <Button
                variant={layoutMode === '2x2' ? 'contained' : 'outlined'}
                onClick={() => {
                  setLayoutMode('2x2');
                  setSelectedCamId(null);
                }}
              >
                <ViewModuleIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="3x3 Grid (9 Feeds)">
              <Button
                variant={layoutMode === '3x3' ? 'contained' : 'outlined'}
                onClick={() => {
                  setLayoutMode('3x3');
                  setSelectedCamId(null);
                }}
              >
                <ViewComfyIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Auto Grid">
              <Button
                variant={layoutMode === 'auto' ? 'contained' : 'outlined'}
                onClick={() => {
                  setLayoutMode('auto');
                  setSelectedCamId(null);
                }}
              >
                <GridViewIcon fontSize="small" />
              </Button>
            </Tooltip>
          </ButtonGroup>

          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setOpenQuickAdd(true)}
            sx={{ fontWeight: 'bold' }}
          >
            Add Camera
          </Button>

          <Tooltip title="Manage Cameras in System Hardware Settings">
            <IconButton
              size="small"
              onClick={() => navigate('/admin/system/hardware/cameras')}
              sx={{ color: 'text.secondary', border: '1px solid', borderColor: 'divider' }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Fallback Banner if no custom cameras added */}
      {camerasList.length === 0 && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              onClick={() => navigate('/admin/system/hardware/cameras')}
              sx={{ fontWeight: 'bold' }}
            >
              Hardware Settings
            </Button>
          }
          sx={{ mb: 3 }}
        >
          Showing default system camera. You can configure multiple RTSP / IP camera streams in <strong>Hardware Settings</strong>.
        </Alert>
      )}

      {/* Main Grid Layout */}
      <Grid container spacing={2.5}>
        {/* Streams Grid Area */}
        <Grid size={{ xs: 12, lg: 9 }}>
          <Grid container spacing={2}>
            {displayedCameras.map((cam) => (
              <Grid size={getGridItemSize()} key={cam.id || cam.url}>
                <Box
                  sx={{
                    position: 'relative',
                    cursor: selectedCamId ? 'default' : 'pointer',
                    '&:hover .camera-focus-btn': { opacity: 1 },
                  }}
                >
                  <HlsPlayer src={cam.url} cameraName={cam.name} />

                  {!selectedCamId && displayedCameras.length > 1 && (
                    <Button
                      className="camera-focus-btn"
                      variant="contained"
                      size="small"
                      onClick={() => setSelectedCamId(cam.id)}
                      sx={{
                        position: 'absolute',
                        bottom: 48,
                        right: 12,
                        opacity: 0.6,
                        transition: 'opacity 0.2s',
                        fontSize: '0.7rem',
                        py: 0.25,
                        px: 1,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 4,
                      }}
                    >
                      Focus
                    </Button>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Sidebar Stream Matrix Information & Management */}
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
                <SecurityIcon fontSize="small" /> NVR Channel Matrix
              </Typography>
              <Button
                size="small"
                onClick={() => navigate('/admin/system/hardware/cameras')}
                sx={{ fontSize: '0.75rem' }}
              >
                Manage
              </Button>
            </Stack>

            <Divider />

            <Typography variant="caption" color="text.secondary">
              Select a camera channel to focus or switch streams:
            </Typography>

            <Stack spacing={1} sx={{ maxHeight: 350, overflowY: 'auto', pr: 0.5 }}>
              {activeCameras.map((cam, idx) => {
                const isFocused = String(cam.id) === String(selectedCamId);
                return (
                  <Paper
                    key={cam.id || idx}
                    variant="outlined"
                    onClick={() => setSelectedCamId(isFocused ? null : cam.id)}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      borderColor: isFocused ? 'primary.main' : 'divider',
                      backgroundColor: isFocused ? 'action.selected' : 'background.default',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: 'primary.light',
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box sx={{ overflow: 'hidden' }}>
                        <Typography variant="body2" fontWeight="600" noWrap color="text.primary">
                          CH {idx + 1}: {cam.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{
                            fontFamily: 'monospace',
                            color: '#00f3ff',
                            display: 'block',
                            fontSize: '0.7rem',
                          }}
                        >
                          {cam.url}
                        </Typography>
                      </Box>

                      <Chip
                        label={String(cam.type || 'HLS').toUpperCase()}
                        size="small"
                        color={isFocused ? 'primary' : 'default'}
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>

            <Divider />

            <Button
              variant="outlined"
              fullWidth
              startIcon={<AddIcon />}
              onClick={() => setOpenQuickAdd(true)}
              size="small"
            >
              Add Camera Feed
            </Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Quick Add Camera Dialog */}
      <Dialog open={openQuickAdd} onClose={() => setOpenQuickAdd(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveNewCamera}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Add Camera Stream</DialogTitle>
          <DialogContent dividers>
            <Stack spacing= {2.5} sx={{ pt: 1 }}>
              <TextField
                label="Camera Label"
                value={newCam.name}
                onChange={(e) => setNewCam({ ...newCam, name: e.target.value })}
                fullWidth
                required
                placeholder="e.g. South Gate Camera"
                helperText="Name displayed on the camera grid"
              />

              <TextField
                label="Stream URL / RTSP HLS Endpoint"
                value={newCam.url}
                onChange={(e) => setNewCam({ ...newCam, url: e.target.value })}
                fullWidth
                required
                placeholder="/cctv/index.m3u8 or http://192.168.1.100:8080/index.m3u8"
                helperText="Relative URL (/cctv/index.m3u8) or full http stream URL"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenQuickAdd(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              Add Camera
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
