import React from 'react';
import { Paper, Box, Typography, Chip, Tooltip } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';

export default function MetricCard({
  title,
  value,
  unit = '',
  status = 'normal', // 'normal', 'warning', 'critical'
  trend = 'stable', // 'up', 'down', 'stable'
  subtitle = '',
}) {
  const getStatusColor = () => {
    switch (status) {
      case 'warning':
        return '#ff9800';
      case 'critical':
        return '#f44336';
      case 'normal':
      default:
        return '#4caf50';
    }
  };

  const formattedValue = typeof value === 'number'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : value ?? 'N/A';

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 4,
          height: '100%',
          backgroundColor: getStatusColor(),
        }}
      />

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5}>
          {title.toUpperCase()}
        </Typography>

        <Chip
          label={status.toUpperCase()}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.65rem',
            backgroundColor: `${getStatusColor()}22`,
            color: getStatusColor(),
            border: `1px solid ${getStatusColor()}55`,
            fontWeight: 700,
          }}
        />
      </Box>

      <Box display="flex" alignItems="baseline" my={1}>
        <Typography variant="h4" fontWeight={700} color="text.primary" sx={{ mr: 1 }}>
          {formattedValue}
        </Typography>
        {unit && (
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {unit}
          </Typography>
        )}
      </Box>

      {subtitle && (
        <Typography variant="caption" color="text.secondary" display="block">
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}
