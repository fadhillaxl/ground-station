import React from 'react';
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
} from '@mui/material';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';

export default function RawFrameInspector({ frames: customFrames, gridEditable = false }) {
  const storeFrames = useSelector((state) => state.telemetry?.rawFrames || []);
  const isEditing = useSelector((state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable);
  const frames = customFrames || storeFrames;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        <Typography variant="body2" fontWeight={700}>
          Raw Telemetry Packet Inspector
        </Typography>

        <Chip
          label={`${frames.length} Packets`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
        />
      </TitleBar>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {frames.length === 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%">
            <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
              No telemetry frames ingested yet. Waiting for live satellite packets...
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ height: '100%' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, width: 100 }}>
                    Timestamp
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Payload (Hex / JSON)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {frames.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        color: 'success.main',
                        wordBreak: 'break-all',
                      }}
                    >
                      {typeof item.raw === 'object'
                        ? JSON.stringify(item.raw)
                        : String(item.raw)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}

