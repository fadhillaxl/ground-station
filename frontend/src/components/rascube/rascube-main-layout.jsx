import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box } from '@mui/material';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { absoluteStrategy } from 'react-grid-layout/core';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { StyledIslandParentNoScrollbar } from '../common/common.jsx';
import { useSocket } from '../common/socket.jsx';
import { useWebSerial } from './use-web-serial.js';
import {
  receiveLiveTelemetry,
  receiveLiveCameraChunk,
  setConnectionState,
  fetchRascubeStatus,
  fetchLatestTelemetry,
  fetchTelemetryHistory,
  fetchCameraStatus,
  fetchLatestCameraImage,
} from './rascube-slice.jsx';

import RascubeTopBar from './rascube-topbar.jsx';
import RascubeMetricCardsIsland from './islands/metric-cards-island.jsx';
import RascubeCameraIsland from './islands/camera-island.jsx';
import RascubeUplinkIsland from './islands/uplink-island.jsx';
import RascubeChartsIsland from './islands/charts-island.jsx';
import RascubeParamsIsland from './islands/params-island.jsx';
import RascubeRawFramesIsland from './islands/raw-frames-island.jsx';
import RascubeDecoderIsland from './islands/decoder-island.jsx';

export const gridLayoutStoreName = 'rascube-layouts';
const LAYOUT_SCHEMA_VERSION = 1;
const SHARED_RESIZE_HANDLES = ['s', 'sw', 'w', 'se', 'nw', 'ne', 'e'];

function loadLayoutsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(gridLayoutStoreName);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!('version' in parsed) || !('layouts' in parsed)) return null;
    return parsed.version === LAYOUT_SCHEMA_VERSION ? parsed.layouts : null;
  } catch {
    return null;
  }
}

function saveLayoutsToLocalStorage(layouts) {
  localStorage.setItem(
    gridLayoutStoreName,
    JSON.stringify({
      version: LAYOUT_SCHEMA_VERSION,
      layouts,
    })
  );
}

function normalizeLayoutsResizeHandles(layouts) {
  if (!layouts || typeof layouts !== 'object') return layouts;
  return Object.fromEntries(
    Object.entries(layouts).map(([breakpoint, items]) => [
      breakpoint,
      Array.isArray(items)
        ? items.map((item) => ({
            ...item,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
          }))
        : items,
    ])
  );
}

const defaultLayouts = {
  lg: [
    { i: 'metric-cards', x: 0, y: 0, w: 48, h: 22, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'uplink', x: 0, y: 22, w: 24, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'camera', x: 24, y: 22, w: 24, h: 36, minH: 16, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'charts', x: 0, y: 46, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 24, y: 58, w: 24, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'params', x: 0, y: 68, w: 24, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoder', x: 0, y: 94, w: 48, h: 22, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  md: [
    { i: 'metric-cards', x: 0, y: 0, w: 40, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'uplink', x: 0, y: 24, w: 20, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'camera', x: 20, y: 24, w: 20, h: 36, minH: 16, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'charts', x: 0, y: 48, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 20, y: 60, w: 20, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'params', x: 0, y: 70, w: 20, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoder', x: 0, y: 96, w: 40, h: 22, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  sm: [
    { i: 'metric-cards', x: 0, y: 0, w: 24, h: 32, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'uplink', x: 0, y: 32, w: 24, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'camera', x: 0, y: 56, w: 24, h: 36, minH: 16, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'charts', x: 0, y: 92, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 114, w: 24, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'params', x: 0, y: 138, w: 24, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoder', x: 0, y: 164, w: 24, h: 22, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 48, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'uplink', x: 0, y: 48, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'camera', x: 0, y: 74, w: 8, h: 40, minH: 16, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'charts', x: 0, y: 114, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 138, w: 8, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'params', x: 0, y: 162, w: 8, h: 28, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoder', x: 0, y: 190, w: 8, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xxs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 54, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'uplink', x: 0, y: 54, w: 8, h: 28, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'camera', x: 0, y: 82, w: 8, h: 44, minH: 16, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'charts', x: 0, y: 126, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 152, w: 8, h: 26, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'params', x: 0, y: 178, w: 8, h: 30, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoder', x: 0, y: 208, w: 8, h: 26, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
};

export default function RascubeMainLayout() {
  const dispatch = useDispatch();
  const { socket } = useSocket();
  const webSerial = useWebSerial();
  const isEditing = useSelector((state) => state.rascube?.gridEditable || false);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  const [layouts, setLayouts] = useState(() => {
    const loaded = loadLayoutsFromLocalStorage();
    return normalizeLayoutsResizeHandles(loaded ?? defaultLayouts);
  });

  // Fetch initial state on mount
  useEffect(() => {
    dispatch(fetchRascubeStatus());
    dispatch(fetchLatestTelemetry());
    dispatch(fetchTelemetryHistory({ limit: 50 }));
    dispatch(fetchCameraStatus());
    dispatch(fetchLatestCameraImage());
  }, [dispatch]);

  // Listen to Socket.IO live broadcasts
  useEffect(() => {
    if (!socket) return;

    const handleTelemetry = (data) => {
      dispatch(receiveLiveTelemetry(data));
    };

    const handleCameraChunk = (chunk) => {
      dispatch(receiveLiveCameraChunk(chunk));
    };

    const handleStatus = (statusData) => {
      dispatch(
        setConnectionState({
          isConnected: statusData.is_connected,
          serialNumber: statusData.serial_number,
          connectedPort: statusData.connected_port,
        })
      );
    };

    socket.on('rascube-telemetry', handleTelemetry);
    socket.on('rascube-camera-chunk', handleCameraChunk);
    socket.on('rascube-status', handleStatus);

    return () => {
      socket.off('rascube-telemetry', handleTelemetry);
      socket.off('rascube-camera-chunk', handleCameraChunk);
      socket.off('rascube-status', handleStatus);
    };
  }, [socket, dispatch]);

  const handleLayoutsChange = useCallback((currentLayout, allLayouts) => {
    const normalized = normalizeLayoutsResizeHandles(allLayouts);
    setLayouts(normalized);
    saveLayoutsToLocalStorage(normalized);
  }, []);

  const handleResetLayout = useCallback(() => {
    localStorage.removeItem(gridLayoutStoreName);
    setLayouts(normalizeLayoutsResizeHandles(defaultLayouts));
  }, []);

  const gridContents = [
    <StyledIslandParentNoScrollbar key="metric-cards">
      <RascubeMetricCardsIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="uplink">
      <RascubeUplinkIsland
        gridEditable={isEditing}
        onBlinkLed={webSerial.sendBlinkLed}
        onPlaySong={webSerial.sendStartupSong}
        onPing={webSerial.sendPing}
        onTriggerCamera={webSerial.triggerCameraCapture}
      />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="camera">
      <RascubeCameraIsland
        gridEditable={isEditing}
        onTriggerCapture={webSerial.triggerCameraCapture}
      />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="charts">
      <RascubeChartsIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="raw-frames">
      <RascubeRawFramesIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="params">
      <RascubeParamsIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,

    <StyledIslandParentNoScrollbar key="decoder">
      <RascubeDecoderIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,
  ];

  return (
    <Box sx={{ width: '100%', height: '100%', p: 1.5, boxSizing: 'border-box' }}>
      <RascubeTopBar
        webSerial={webSerial}
        onResetLayout={handleResetLayout}
      />

      <div ref={containerRef}>
        {mounted ? (
          <Responsive
            width={width}
            positionStrategy={absoluteStrategy}
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 48, md: 40, sm: 24, xs: 8, xxs: 8 }}
            rowHeight={8}
            dragConfig={{ enabled: isEditing, handle: '.react-grid-draggable' }}
            resizeConfig={{ enabled: isEditing }}
          >
            {gridContents}
          </Responsive>
        ) : null}
      </div>
    </Box>
  );
}
