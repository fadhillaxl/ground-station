import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Stack,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';
import { fetchLatestCameraImage, fetchCameraStatus } from '../rascube-slice.jsx';

export default function RascubeCameraIsland({ gridEditable = false, onTriggerCapture }) {
  const dispatch = useDispatch();
  const { camera, isConnected } = useSelector((state) => state.rascube);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);

  const { status, progress, chunks, latestImageBase64, partialImageBase64, latestImageMetadata } = camera;

  // Image source priority: full completed image -> partial synthesized image -> null
  const currentImageSrc = latestImageBase64
    ? `data:image/jpeg;base64,${latestImageBase64}`
    : partialImageBase64
    ? `data:image/jpeg;base64,${partialImageBase64}`
    : null;

  const estimatedTotalBlocks = 75;
  const blocksCount = progress.blocks_received || chunks.length || 0;
  const progressPercent = Math.min(
    100,
    status === 'completed'
      ? 100
      : Math.round((blocksCount / estimatedTotalBlocks) * 100)
  );

  const handleDownload = () => {
    if (!currentImageSrc) return;
    const a = document.createElement('a');
    a.href = currentImageSrc;
    a.download = `rascube-capture-${Date.now()}.jpg`;
    a.click();
  };

  const handleRefresh = () => {
    dispatch(fetchCameraStatus());
    dispatch(fetchLatestCameraImage());
  };

  const getStatusChip = () => {
    switch (status) {
      case 'capturing':
        return (
          <Chip
            size="small"
            icon={<HourglassEmptyIcon fontSize="small" />}
            label="Capturing (Web USB)"
            color="warning"
            sx={{ height: 22, fontSize: '0.72rem' }}
          />
        );
      case 'completed':
        return (
          <Chip
            size="small"
            icon={<CheckCircleIcon fontSize="small" />}
            label="Complete"
            color="success"
            sx={{ height: 22, fontSize: '0.72rem' }}
          />
        );
      case 'failed':
        return (
          <Chip
            size="small"
            icon={<ErrorOutlineIcon fontSize="small" />}
            label="Failed"
            color="error"
            sx={{ height: 22, fontSize: '0.72rem' }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            label="Idle"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.72rem' }}
          />
        );
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <PhotoCameraIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Progressive Camera Chunk Assembler
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {getStatusChip()}
          <Tooltip title="Refresh Camera State">
            <IconButton size="small" onClick={handleRefresh}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Action Controls & Speed Metrics */}
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button
            variant="contained"
            size="small"
            startIcon={<PhotoCameraIcon />}
            disabled={!isConnected || status === 'capturing'}
            onClick={onTriggerCapture}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {status === 'capturing' ? 'Capturing...' : 'Trigger Photo'}
          </Button>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {progress.elapsed_seconds > 0 && (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                Speed: {progress.transfer_speed_bps} B/s | Time: {progress.elapsed_seconds}s
              </Typography>
            )}
            {currentImageSrc && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                sx={{ textTransform: 'none' }}
              >
                Download JPEG
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Transfer Progress Bar */}
        {(status === 'capturing' || blocksCount > 0) && (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                Transfer Progress ({blocksCount} blocks / {progress.total_bytes} bytes)
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 700 }}>
                {progressPercent}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}

        {/* Live Received Chunks Grid Matrix */}
        {chunks.length > 0 && (
          <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.5 }}>
                Chunk Matrix Stream
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>
                {chunks.length} chunks
              </Typography>
            </Stack>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 85, overflowY: 'auto' }}>
              {chunks.map((chk) => (
                <Chip
                  key={chk.index}
                  size="small"
                  label={`#${chk.index}`}
                  title={`Block ${chk.index}: ${chk.size}B`}
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.68rem',
                    height: 20,
                    bgcolor: 'primary.main',
                    color: '#fff',
                    opacity: 0.9,
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Live Progressive JPEG Display */}
        <Box
          sx={{
            flex: 1,
            minHeight: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.3)',
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
            p: 1,
            overflow: 'hidden',
          }}
        >
          {currentImageSrc ? (
            <Box sx={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={currentImageSrc}
                alt="Satellite Capture"
                style={{
                  maxWidth: '100%',
                  maxHeight: '260px',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontFamily: 'monospace' }}>
                {status === 'capturing' ? '⚡ Progressive Preview Active' : '✅ Full JPEG Reconstructed'}
                {latestImageMetadata && ` • ${latestImageMetadata.byte_length} bytes • ${latestImageMetadata.block_count} blocks`}
              </Typography>
            </Box>
          ) : (
            <Stack alignItems="center" spacing={1} sx={{ color: 'text.secondary', p: 2 }}>
              <PhotoCameraIcon sx={{ fontSize: 40, opacity: 0.4 }} />
              <Typography variant="body2" sx={{ textAlign: 'center' }}>
                No satellite image captured yet.
              </Typography>
              <Typography variant="caption" sx={{ textAlign: 'center', opacity: 0.7 }}>
                Click "Trigger Photo" to send OBC Port 0x13 command and stream chunks via Web Serial.
              </Typography>
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
