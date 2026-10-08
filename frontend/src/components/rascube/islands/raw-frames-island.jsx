import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../../common/common.jsx';

export default function RascubeRawFramesIsland({ gridEditable = false }) {
  const history = useSelector((state) => state.rascube?.telemetryHistory || []);
  const isEditing = useSelector((state) => state.rascube?.gridEditable || gridEditable);
  const [selectedHex, setSelectedHex] = useState(null);

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700}>
            Raw Telemetry Packet Inspector
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${history.length} frames buffer`}
          sx={{ height: 20, fontSize: '0.68rem', fontFamily: 'monospace' }}
        />
      </TitleBar>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
        <TableContainer sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5, fontSize: '0.72rem', fontWeight: 700 }}>Seq</TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.72rem', fontWeight: 700 }}>Time</TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.72rem', fontWeight: 700 }}>RSSI</TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.72rem', fontWeight: 700 }}>Hex Stream Preview</TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.72rem', fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Waiting for telemetry frames from Web Serial...
                  </TableCell>
                </TableRow>
              ) : (
                history.map((sample, idx) => {
                  const hex = sample.raw_hex || '';
                  const preview = hex.length > 28 ? `${hex.slice(0, 28)}...` : hex;
                  const timeStr = sample.timestamp
                    ? new Date(sample.timestamp * 1000).toLocaleTimeString()
                    : 'Live';

                  return (
                    <TableRow key={sample.packet_sequence ?? idx} hover>
                      <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600 }}>
                        #{sample.packet_sequence ?? '-'}
                      </TableCell>
                      <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary' }}>
                        {timeStr}
                      </TableCell>
                      <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.72rem' }}>
                        {sample.receiver_rssi != null ? `${sample.receiver_rssi.toFixed(0)} dBm` : '-'}
                      </TableCell>
                      <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.72rem', color: 'primary.light' }}>
                        {preview}
                      </TableCell>
                      <TableCell sx={{ py: 0.5, textAlign: 'right' }}>
                        <Tooltip title="View Complete Frame Hex">
                          <IconButton size="small" onClick={() => setSelectedHex(hex)}>
                            <VisibilityIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy Raw HEX">
                          <IconButton size="small" onClick={() => copyToClipboard(hex)}>
                            <ContentCopyIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Full Hex Dialog */}
      <Dialog open={Boolean(selectedHex)} onClose={() => setSelectedHex(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 700 }}>
          Raw Packet Hex Payload (121-123 Bytes)
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'background.default',
              borderRadius: 1.5,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              wordBreak: 'break-all',
              border: '1px solid',
              borderColor: 'divider',
              color: 'primary.light',
            }}
          >
            {selectedHex}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => copyToClipboard(selectedHex)}>
            Copy Hex
          </Button>
          <Button size="small" onClick={() => setSelectedHex(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
