import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  TitleBar,
  islandTitleBarSx,
  getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';

function getCategory(key) {
  if (key.includes('eps') || key.includes('bat') || key.includes('sa1') || key.includes('sa2') || key.includes('bus')) {
    return { name: 'EPS/Power', color: '#ffb74d' };
  }
  if (key.includes('adcs') || key.includes('wheel') || key.includes('quat') || key.includes('rt') || key.includes('sun')) {
    return { name: 'ADCS', color: '#29b6f6' };
  }
  if (key.includes('temp') || key.includes('therm')) {
    return { name: 'Thermal', color: '#ff5252' };
  }
  if (key.includes('cmd') || key.includes('seq') || key.includes('cdh')) {
    return { name: 'CD&H', color: '#00e676' };
  }
  if (key.includes('sband') || key.includes('uhf') || key.includes('rx') || key.includes('callsign')) {
    return { name: 'COMMS', color: '#ab47bc' };
  }
  return { name: 'System', color: '#90caf9' };
}

export default function DecodedParamsIsland({ gridEditable = false }) {
  const latestMetrics = useSelector((state) => state.telemetry?.latestMetrics || {});
  const isEditing = useSelector((state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || gridEditable);
  const [searchTerm, setSearchTerm] = useState('');

  const entries = Object.entries(latestMetrics)
    .filter(([key]) => key !== 'raw' && key !== 'Time')
    .filter(([key]) => key.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TitleBar
        className={getClassNamesBasedOnGridEditing(isEditing, [])}
        sx={{ ...islandTitleBarSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        <Typography variant="body2" fontWeight={700}>
          Decoded Telemetry Channels ({entries.length})
        </Typography>

        <TextField
          placeholder="Filter channel..."
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: 180,
            '& .MuiInputBase-input': { py: 0.3, px: 0.5, fontSize: '0.75rem' },
          }}
        />
      </TitleBar>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TableContainer sx={{ height: '100%' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Channel / Field</TableCell>
                <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Subsystem</TableCell>
                <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No channels match search filter.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map(([key, val]) => {
                  const cat = getCategory(key);
                  const displayVal = typeof val === 'boolean'
                    ? (val ? 'TRUE' : 'FALSE')
                    : typeof val === 'number'
                    ? val.toLocaleString()
                    : String(val);

                  return (
                    <TableRow key={key} hover>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                        {key}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Chip
                          label={cat.name}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: cat.color,
                            border: `1px solid ${cat.color}66`,
                            backgroundColor: `${cat.color}15`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'primary.main', fontWeight: 700 }}>
                        {displayVal}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
