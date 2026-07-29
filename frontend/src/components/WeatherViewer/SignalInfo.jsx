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
    <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h6" color="primary" sx={{ display: 'flex', alignItems: 'center', mb: 2, fontWeight: 'bold' }}>
          <SignalCellularAltIcon sx={{ mr: 1 }} /> Signal & Demodulator Diagnostics
        </Typography>

        <Grid container spacing={2}>
          {/* Locks */}
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bg: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Viterbi Lock</Typography>
              <Chip
                icon={viterbi_lock ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                label={viterbi_lock ? "LOCKED" : "UNLOCKED"}
                color={viterbi_lock ? "success" : "default"}
                size="small"
                variant={viterbi_lock ? "filled" : "outlined"}
              />
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bg: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Deframer Lock</Typography>
              <Chip
                icon={deframer_lock ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                label={deframer_lock ? "LOCKED" : "UNLOCKED"}
                color={deframer_lock ? "success" : "default"}
                size="small"
                variant={deframer_lock ? "filled" : "outlined"}
              />
            </Box>
          </Grid>

          {/* SNR Metrics */}
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">SNR (Live)</Typography>
            <Typography variant="h4" color={`${getSnrColor(snr)}.main`} sx={{ fontWeight: 'bold', mt: 0.5 }}>
              {snr.toFixed(1)} <Typography component="span" variant="body1">dB</Typography>
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={Math.min(100, Math.max(0, (snr / 16) * 100))} 
              color={getSnrColor(snr)} 
              sx={{ height: 6, borderRadius: 3, mt: 1, backgroundColor: 'action.selected' }} 
            />
          </Grid>

          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">Peak SNR</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', mt: 0.5, color: 'text.primary' }}>
              {peak_snr.toFixed(1)} <Typography component="span" variant="body2">dB</Typography>
            </Typography>
          </Grid>

          {/* Frequency & Error Stats */}
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">Carrier Frequency Offset</Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', mt: 0.5, color: 'info.main' }}>
              {freq_offset > 0 ? `+${freq_offset.toFixed(1)}` : freq_offset.toFixed(1)} Hz
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">Bit Error Rate (BER)</Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', mt: 0.5, color: ber > 0.05 ? 'warning.main' : 'text.primary' }}>
              {ber.toExponential(3)}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', backgroundColor: 'action.hover' }}>
              <ErrorOutlineIcon sx={{ mr: 1, color: rs_errors > 0 ? 'warning.main' : 'success.main' }} fontSize="small" />
              <Typography variant="caption" color="text.secondary">
                Reed-Solomon Frame Corrections: <strong style={{ color: rs_errors > 0 ? '#ffb74d' : '#81c784' }}>{rs_errors} avg/pkt</strong>
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
