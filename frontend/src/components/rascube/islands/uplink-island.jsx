import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SensorsIcon from '@mui/icons-material/Sensors';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';
import { clearUplinkLogs } from '../rascube-slice.jsx';

export default function RascubeUplinkIsland({
  gridEditable = false,
  onBlinkLed,
  onPlaySong,
  onPing,
  onTriggerCamera,
}) {
  const dispatch = useDispatch();
  const { isConnected, uplinkLogs } = useSelector((state) => state.rascube);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <SendIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Satellite Radio Uplink & Control
          </Typography>
        </Stack>
        <Tooltip title="Clear Uplink Log">
          <IconButton size="small" onClick={() => dispatch(clearUplinkLogs())}>
            <DeleteSweepIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Command Buttons */}
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
          Direct Radio Uplink Commands:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            size="small"
            startIcon={<LightbulbIcon />}
            disabled={!isConnected}
            onClick={onBlinkLed}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Blink RGB LED
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<MusicNoteIcon />}
            disabled={!isConnected}
            onClick={onPlaySong}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Play Startup Song
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<SensorsIcon />}
            disabled={!isConnected}
            onClick={onPing}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Ping OBC
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<PhotoCameraIcon />}
            disabled={!isConnected}
            onClick={onTriggerCamera}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Capture Photo
          </Button>
        </Stack>

        <Divider sx={{ my: 0.5 }} />

        {/* Command Stream Log */}
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
          Transmitted Uplink Frames ({uplinkLogs.length}):
        </Typography>
        <Box
          sx={{
            flex: 1,
            minHeight: 100,
            maxHeight: 220,
            overflowY: 'auto',
            bgcolor: 'rgba(0,0,0,0.3)',
            borderRadius: 1.5,
            p: 1,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {uplinkLogs.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', display: 'block', p: 1 }}>
              No uplink commands sent in this session.
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {uplinkLogs.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 0.5,
                    bgcolor: 'rgba(255,255,255,0.02)',
                    borderRadius: 1,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={log.type}
                      color={log.status === 'error' ? 'error' : 'primary'}
                      sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                    />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {log.message}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {log.hex && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                        HEX: {log.hex}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
                      {log.timestamp}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
