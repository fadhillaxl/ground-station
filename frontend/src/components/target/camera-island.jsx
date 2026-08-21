import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Stack,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Tooltip,
  Chip,
  Button,
  useTheme,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import HlsPlayer from '../cctv/hls-player.jsx';
import { useSocket } from '../common/socket.jsx';
import { fetchCameras } from '../hardware/camera-slice.jsx';

export default function TargetCameraIsland() {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { socket } = useSocket();

  const gridEditable = useSelector((state) => state.target?.gridEditable || false);
  const camerasList = useSelector((state) => state.cameras?.list || []);
  const [selectedCamId, setSelectedCamId] = useState(null);

  useEffect(() => {
    if (socket) {
      dispatch(fetchCameras({ socket }));
    }
  }, [dispatch, socket]);

  // Set default selected camera when list is fetched
  useEffect(() => {
    if (camerasList.length > 0 && !selectedCamId) {
      setSelectedCamId(camerasList[0].id);
    }
  }, [camerasList, selectedCamId]);

  const activeCam =
    camerasList.find((c) => String(c.id) === String(selectedCamId)) ||
    camerasList[0] || {
      id: 'default',
      name: localStorage.getItem('groundstation_cctv_camera_name') || 'Ground Station Cam',
      url: localStorage.getItem('groundstation_cctv_stream_url') || '/cctv/index.m3u8',
      type: 'hls',
      status: 'active',
    };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(gridEditable, [])}
        sx={{
          ...islandTitleBarSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 1,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <VideocamIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={700} noWrap>
            Camera View
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.8} alignItems="center">
          {camerasList.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select
                value={selectedCamId || ''}
                onChange={(e) => setSelectedCamId(e.target.value)}
                size="small"
                sx={{ height: 22, fontSize: '0.7rem' }}
              >
                {camerasList.map((cam) => (
                  <MenuItem key={cam.id} value={cam.id} sx={{ fontSize: '0.72rem' }}>
                    {cam.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Chip
            size="small"
            label="LIVE"
            color="success"
            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 'bold' }}
          />

          <Tooltip title="Open Full CCTV Monitor">
            <IconButton size="small" onClick={() => navigate('/cctv')} sx={{ p: 0.2 }}>
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </TitleBar>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          bgcolor: '#000',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {activeCam && activeCam.url ? (
          <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            <HlsPlayer
              src={activeCam.url}
              name={activeCam.name}
              showControls={true}
              muted={true}
            />
          </Box>
        ) : (
          <Stack spacing={1} alignItems="center" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              No active camera configured.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => navigate('/admin/system/hardware/cameras')}
              sx={{ fontSize: '0.7rem' }}
            >
              Configure Cameras
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
