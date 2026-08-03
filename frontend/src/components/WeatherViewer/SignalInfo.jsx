import React from 'react';
import { Card, CardContent, Typography, Grid, Chip, Box, LinearProgress } from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export default function SignalInfo({ signalData }) {
  const snr = typeof (signalData?.snr) === 'number' ? signalData.snr : 0.0;
  const peak_snr = typeof (signalData?.peak_snr) === 'number' ? signalData.peak_snr : 0.0;
  const freq_offset = typeof (signalData?.freq_offset) === 'number' ? signalData.freq_offset : 0.0;
  const viterbi_lock = Boolean(signalData?.viterbi_lock);
  const deframer_lock = Boolean(signalData?.deframer_lock);
  const rs_errors = typeof (signalData?.rs_errors) === 'number' ? signalData.rs_errors : 0;
  const ber = typeof (signalData?.ber) === 'number' ? signalData.ber : 0.0;

  // Color logic for SNR quality
  const getSnrColor = (val) => {
    if (val > 8) return 'success';
    if (val > 4) return 'warning';
    return 'error';
  };

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, flexShrink: 0, backgroundColor: 'background.paper' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" color="primary" sx={{ display: 'flex', alignItems: 'center', mb: 1.5, fontWeight: 'bold' }}>
          <SignalCellularAltIcon sx={{ mr: 1, fontSize: '1.25rem' }} /> Signal & Demodulator Diagnostics
        </Typography>

        <Grid container spacing={1.5}>
          {/* Locks */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, px: 1.5, backgroundColor: 'action.hover', borderRadius: 1, height: 38 }}>
              <Typography variant="body2" color="text.secondary">Viterbi</Typography>
              <Chip
                icon={viterbi_lock ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                label={viterbi_lock ? "LOCKED" : "UNLOCKED"}
                color={viterbi_lock ? "success" : "default"}
                size="small"
                variant={viterbi_lock ? "filled" : "outlined"}
                sx={{ height: 22, '& .MuiChip-label': { px: 1, fontSize: '0.65rem', fontWeight: 'bold' } }}
              />
            </Box>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, px: 1.5, backgroundColor: 'action.hover', borderRadius: 1, height: 38 }}>
              <Typography variant="body2" color="text.secondary">Deframer</Typography>
              <Chip
                icon={deframer_lock ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                label={deframer_lock ? "LOCKED" : "UNLOCKED"}
                color={deframer_lock ? "success" : "default"}
                size="small"
                variant={deframer_lock ? "filled" : "outlined"}
                sx={{ height: 22, '& .MuiChip-label': { px: 1, fontSize: '0.65rem', fontWeight: 'bold' } }}
              />
            </Box>
          </Grid>

          {/* Equalized 3-Column Metrics Grid */}
          <Grid size={{ xs: 4 }}>
            <Box sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>SNR (Live)</Typography>
              <Typography variant="h6" color={`${getSnrColor(snr)}.main`} sx={{ fontWeight: 'bold', fontFamily: 'monospace', mt: 0.5, lineHeight: 1.1 }}>
                {snr.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>dB</span>
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(100, Math.max(0, (snr / 16) * 100))} 
                color={getSnrColor(snr)} 
                sx={{ height: 4, borderRadius: 2, mt: 1, backgroundColor: 'action.selected' }} 
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 4 }}>
            <Box sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Peak SNR</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', fontFamily: 'monospace', mt: 0.5, color: 'text.primary', lineHeight: 1.1 }}>
                {peak_snr.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>dB</span>
              </Typography>
              <Box sx={{ height: 4, mt: 1 }} />
            </Box>
          </Grid>

          <Grid size={{ xs: 4 }}>
            <Box sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>BER</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', fontFamily: 'monospace', mt: 0.5, color: ber > 0.05 ? 'warning.main' : 'text.primary', fontSize: '0.75rem', lineHeight: 1.1, wordBreak: 'break-all' }}>
                {ber.toExponential(2)}
              </Typography>
              <Box sx={{ height: 4, mt: 1 }} />
            </Box>
          </Grid>

          {/* Carrier Frequency Offset and RS errors */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ p: 1, borderRadius: 1, backgroundColor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Freq Offset</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold', mt: 0.5, color: 'info.main' }}>
                {freq_offset > 0 ? `+${freq_offset.toFixed(1)}` : freq_offset.toFixed(1)} Hz
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6 }}>
            <Box sx={{ p: 1, borderRadius: 1, backgroundColor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>RS Corrections</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold', mt: 0.5, color: rs_errors > 0 ? 'warning.main' : 'success.main' }}>
                {rs_errors} avg/pkt
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
