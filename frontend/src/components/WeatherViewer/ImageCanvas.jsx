import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Stack, Button } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CropFreeIcon from '@mui/icons-material/CropFree';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DownloadIcon from '@mui/icons-material/Download';

export default function ImageCanvas({ imageUpdate, filterStyle = "" }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const bufferCanvasRef = useRef(null);

  // Pan and zoom states
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270

  // Active image metadata
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Handle incoming progressive tile
  useEffect(() => {
    if (!imageUpdate) return;
    const { width, height, y_offset, total_height, data } = imageUpdate;

    // 1. Initialize or resize the buffer canvas
    let buffer = bufferCanvasRef.current;
    if (!buffer) {
      buffer = document.createElement('canvas');
      bufferCanvasRef.current = buffer;
    }

    if (buffer.width !== width || buffer.height !== total_height) {
      // Create a temporary canvas to hold old contents during resize
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = buffer.width;
      tempCanvas.height = buffer.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx && buffer.width > 0 && buffer.height > 0) {
        tempCtx.drawImage(buffer, 0, 0);
      }

      // Resize main buffer
      buffer.width = width;
      buffer.height = total_height;

      // Restore old contents
      const bufferCtx = buffer.getContext('2d');
      if (bufferCtx && tempCanvas.width > 0 && tempCanvas.height > 0) {
        bufferCtx.drawImage(tempCanvas, 0, 0);
      }
      setImgSize({ w: width, h: total_height });
    }

    // 2. Load and draw the base64 JPEG tile onto the buffer canvas
    const img = new Image();
    img.onload = () => {
      const bufferCtx = buffer.getContext('2d');
      if (bufferCtx) {
        bufferCtx.drawImage(img, 0, y_offset, width, height);
        drawScreen(); // Redraw the visible screen canvas
      }
    };
    img.src = 'data:image/jpeg;base64,' + data;
  }, [imageUpdate]);

  // Main draw loop (draw buffer onto screen canvas applying zoom, pan, rotation)
  const drawScreen = () => {
    const canvas = canvasRef.current;
    const buffer = bufferCanvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset canvas dimensions to fill container size
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear visible screen
    ctx.fillStyle = '#121218';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Apply panning translation
    ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
    
    // Apply scaling (zoom)
    ctx.scale(scale, scale);

    // Apply rotation
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Draw the image buffer centered
    ctx.drawImage(buffer, -buffer.width / 2, -buffer.height / 2);
    
    ctx.restore();
  };

  // Re-draw whenever transform states change
  useEffect(() => {
    drawScreen();
  }, [scale, offset, rotation, imgSize]);

  // Handle auto-fit zoom
  const handleAutoFit = () => {
    const canvas = canvasRef.current;
    const buffer = bufferCanvasRef.current;
    if (!canvas || !buffer || buffer.width === 0) return;

    const scaleX = canvas.width / buffer.width;
    const scaleY = canvas.height / buffer.height;
    const fitScale = Math.min(scaleX, scaleY) * 0.95;

    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  };

  // Resize listener
  useEffect(() => {
    const handleResize = () => drawScreen();
    window.addEventListener('resize', handleResize);
    // Initial auto fit delay to let container layout complete
    setTimeout(handleAutoFit, 100);
    return () => window.removeEventListener('resize', handleResize);
  }, [imgSize]);

  // Dragging event handlers (Pan)
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom on wheel scroll
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextScale = scale;
    if (e.deltaY < 0) {
      nextScale = Math.min(scale * zoomFactor, 20);
    } else {
      nextScale = Math.max(scale / zoomFactor, 0.05);
    }
    setScale(nextScale);
  };

  // Download the generated image
  const handleDownload = () => {
    const buffer = bufferCanvasRef.current;
    if (!buffer || buffer.width === 0) return;

    const link = document.createElement('a');
    link.download = `weather_pass_${Date.now()}.png`;
    link.href = buffer.toDataURL('image/png');
    link.click();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Toolbars */}
      <Stack direction="row" spacing={1} sx={{ p: 1, bg: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={() => setScale(s => Math.min(s * 1.2, 20))} color="primary">
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={() => setScale(s => Math.max(s / 1.2, 0.05))} color="primary">
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Auto Fit">
            <IconButton size="small" onClick={handleAutoFit} color="primary">
              <CropFreeIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Rotate 90°">
            <IconButton size="small" onClick={() => setRotation(r => (r + 90) % 360)} color="primary">
              <RotateRightIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        <Button
          variant="contained"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={!imgSize.w}
        >
          Export PNG
        </Button>
      </Stack>

      {/* Drawing Viewport */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundColor: '#121218'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            filter: filterStyle // Apply color filters (e.g. grayscale, false color) dynamically
          }}
        />
      </Box>
    </Box>
  );
}
