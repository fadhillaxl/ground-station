import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Stack,
  Paper,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import RefreshIcon from '@mui/icons-material/Refresh';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import { resolveUrl } from '../../utils/url.js';

export default function HlsPlayer({
  src = '/cctv/index.m3u8',
  cameraName = 'Main Entrance',
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timestamp, setTimestamp] = useState('');

  // Live timestamp clock update
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimestamp(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup helper for HLS instance and timers
  const destroyHls = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Initialize and load stream
  const loadStream = useCallback(() => {
    destroyHls();
    setLoading(true);
    setError(false);

    const video = videoRef.current;
    if (!video) return;

    const targetUrl = resolveUrl(src);

    // Standard native HLS support (e.g., Safari iOS/macOS)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl;
      video.muted = true;
      video
        .play()
        .then(() => {
          setLoading(false);
          setIsPlaying(true);
          setError(false);
        })
        .catch((err) => {
          console.warn('Native video autoplay playback blocked/failed:', err);
          setLoading(false);
          setError(true);
          scheduleRetry();
        });
      return;
    }

    // Hls.js fallback for browsers supporting MSE
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
      });
      hlsRef.current = hls;

      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        setError(false);
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('Autoplay muted playback deferred:', err);
          });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS.js event error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Fatal network error encountered, attempting recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Fatal media error encountered, recovering...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal unrecoverable error, marking stream offline');
              destroyHls();
              setLoading(false);
              setError(true);
              scheduleRetry();
              break;
          }
        }
      });
    } else {
      console.error('Neither HLS.js nor native HLS is supported in this browser.');
      setLoading(false);
      setError(true);
    }
  }, [src, destroyHls]);

  // Schedule auto-retry every 5 seconds on stream failure
  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      console.log('Auto-retrying CCTV HLS stream connection...');
      loadStream();
    }, 5000);
  }, [loadStream]);

  // Mount/unmount stream binding
  useEffect(() => {
    loadStream();
    return () => {
      destroyHls();
    };
  }, [loadStream, destroyHls]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handlers
  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  const handleManualRefresh = () => {
    loadStream();
  };

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video || error || loading) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${cameraName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.png`;
        a.click();
      }
    } catch (e) {
      console.error('Failed to capture snapshot frame:', e);
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: '#0c0d10',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Video Container Aspect 16/9 */}
      <Box
        ref={containerRef}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          backgroundColor: '#000000',
          borderRadius: isFullscreen ? 0 : 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onPlaying={() => {
            setLoading(false);
            setError(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
            display: 'block',
          }}
        />

        {/* Top Overlay Badges */}
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {/* Camera Name Tag */}
          <Chip
            icon={<VideocamIcon sx={{ fontSize: '1rem !important', color: '#39ff14 !important' }} />}
            label={cameraName}
            size="small"
            sx={{
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: '#ffffff',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              pointerEvents: 'auto',
            }}
          />

          {/* Timestamp & Online Status */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pointerEvents: 'auto' }}>
            <Chip
              label={timestamp}
              size="small"
              sx={{
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                color: '#e0e0e0',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
            <Chip
              size="small"
              label={error ? 'OFFLINE' : loading ? 'CONNECTING' : 'LIVE'}
              sx={{
                backgroundColor: error
                  ? 'rgba(244, 67, 54, 0.85)'
                  : loading
                  ? 'rgba(255, 152, 0, 0.85)'
                  : 'rgba(57, 255, 20, 0.85)',
                color: error || loading ? '#fff' : '#000',
                fontWeight: 'bold',
                fontSize: '0.7rem',
                letterSpacing: 0.5,
              }}
            />
          </Stack>
        </Box>

        {/* Loading Overlay */}
        {loading && !error && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              zIndex: 3,
            }}
          >
            <CircularProgress size={48} sx={{ color: '#00f3ff' }} />
            <Typography variant="body1" sx={{ color: '#ffffff', fontWeight: 500 }}>
              Connecting to CCTV...
            </Typography>
          </Box>
        )}

        {/* Error / Offline Overlay */}
        {error && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(12, 13, 16, 0.92)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              zIndex: 3,
            }}
          >
            <VideocamOffIcon sx={{ fontSize: 56, color: '#ff5d6c' }} />
            <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 600 }}>
              CCTV Offline
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 300, textAlign: 'center' }}>
              Unable to load HLS stream from <code>{src}</code>. Auto-retrying every 5 seconds...
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleManualRefresh}
              sx={{
                mt: 1,
                backgroundColor: 'primary.main',
                color: '#fff',
                fontWeight: 'bold',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              }}
            >
              Retry Connection
            </Button>
          </Box>
        )}
      </Box>

      {/* Control Bar Footer */}
      <Box
        sx={{
          p: 1.5,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          backgroundColor: '#12141a',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
            <IconButton
              size="small"
              onClick={handleTogglePlay}
              disabled={loading || error}
              sx={{ color: 'primary.main' }}
            >
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Refresh Stream">
            <IconButton size="small" onClick={handleManualRefresh} sx={{ color: 'text.secondary' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Take Snapshot (PNG)">
            <IconButton
              size="small"
              onClick={handleTakeSnapshot}
              disabled={loading || error}
              sx={{ color: 'text.secondary' }}
            >
              <CameraAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            <IconButton size="small" onClick={handleToggleFullscreen} sx={{ color: 'text.secondary' }}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Paper>
  );
}
