import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';
import { decodeHexPayload } from '../rascube-slice.jsx';

export default function RascubeDecoderIsland({ gridEditable = false }) {
  const dispatch = useDispatch();
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);
  const [hexInput, setHexInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleDecode = async () => {
    if (!hexInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dispatch(decodeHexPayload({ hex: hexInput.trim() })).unwrap();
      setResult(res);
    } catch (err) {
      setError(err || 'Failed to decode hex');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = () => {
    // 123-byte sample frame: port 0x10, len 0x79 (121), followed by 121 bytes
    const sampleHex =
      '107901000000A013A40C6400C8002C013610FA008813F40160106AFFF80B3200020C3C000C0C4600010140E201000A00ECFF1E00F50000204746A042160000000000A04100000000000000000000803F0C0100004841000080BF0000AA4200000200009D4200001341';
    setHexInput(sampleHex);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <DataObjectIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Standalone Telemetry HEX Decoder
          </Typography>
        </Stack>
        <Button size="small" onClick={handleLoadSample} sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
          Load Sample Frame
        </Button>
      </TitleBar>

      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          multiline
          rows={3}
          size="small"
          placeholder="Paste raw 121, 122, or 123 byte HEX telemetry packet..."
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.78rem' } }}
          fullWidth
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrowIcon />}
            disabled={!hexInput.trim() || loading}
            onClick={handleDecode}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {loading ? 'Decoding...' : 'Decode Frame'}
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}

        {result && (
          <Box sx={{ flex: 1, minHeight: 120 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
              Decoded JSON Structure:
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                p: 1,
                bgcolor: 'rgba(0,0,0,0.3)',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                maxHeight: 200,
                overflowY: 'auto',
                color: '#a5f3fc',
              }}
            >
              {JSON.stringify(result, null, 2)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
