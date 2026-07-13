import React, { useEffect, useRef } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';

export default function Constellation({ points = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const center_x = width / 2;
    const center_y = height / 2;
    const scale = (width / 2) * 0.8; // Scale factor to fit points in viewport

    // Clear canvas
    ctx.fillStyle = '#0f0f15';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Rings & Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Draw outer circle
    ctx.beginPath();
    ctx.arc(center_x, center_y, scale, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw inner circle
    ctx.beginPath();
    ctx.arc(center_x, center_y, scale * 0.5, 0, 2 * Math.PI);
    ctx.stroke();

    // Axes
    ctx.beginPath();
    ctx.moveTo(0, center_y);
    ctx.lineTo(width, center_y);
    ctx.moveTo(center_x, 0);
    ctx.lineTo(center_x, height);
    ctx.stroke();

    // Draw IQ points
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)'; // Cyan with transparency
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
    
    for (const point of points) {
      if (Array.isArray(point) && point.length === 2) {
        const i = point[0];
        const q = point[1];
        
        // Map to canvas coordinate system
        const x = center_x + i * scale;
        const y = center_y - q * scale; // invert Y for standard Cartesian coordinates
        
        // Draw small dot
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Reset shadow
    ctx.shadowBlur = 0;
  }, [points]);

  return (
    <Card sx={{ background: 'rgba(30, 30, 40, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h6" color="primary" sx={{ display: 'flex', alignItems: 'center', mb: 2, fontWeight: 'bold', alignSelf: 'flex-start', width: '100%' }}>
          <GpsFixedIcon sx={{ mr: 1 }} /> Constellation Diagram (I/Q)
        </Typography>

        <Box sx={{ position: 'relative', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            width={280}
            height={280}
            style={{ display: 'block', backgroundColor: '#0f0f15' }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
