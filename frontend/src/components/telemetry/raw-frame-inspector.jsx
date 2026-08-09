import React from 'react';
import {
  Paper,
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

export default function RawFrameInspector({ frames = [] }) {
  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="subtitle1" fontWeight={700} color="text.primary">
          Raw Telemetry Packet Inspector
        </Typography>

        <Chip
          label={`${frames.length} Packets`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
      </Box>

      {frames.length === 0 ? (
        <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
          No telemetry frames ingested yet. Waiting for live satellite passes...
        </Typography>
      ) : (
        <TableContainer sx={{ maxHeight: 280 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ backgroundColor: '#0f172a', fontWeight: 700, color: '#94a3b8' }}>
                  Timestamp
                </TableCell>
                <TableCell sx={{ backgroundColor: '#0f172a', fontWeight: 700, color: '#94a3b8' }}>
                  Payload (Hex / JSON)
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {frames.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b' }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: '#00e676',
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
    </Paper>
  );
}
