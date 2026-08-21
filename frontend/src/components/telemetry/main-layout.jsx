import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box } from '@mui/material';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { absoluteStrategy } from 'react-grid-layout/core';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import {
  StyledIslandParentNoScrollbar,
  StyledIslandParentScrollbar,
} from '../common/common.jsx';
import { useSocket } from '../common/socket.jsx';
import { receiveLiveTelemetry } from './telemetry-slice.jsx';

import TtncTopBar from './ttnc-topbar.jsx';
import MetricCardsIsland from './metric-cards-island.jsx';
import TelemetryChartIsland from './telemetry-chart-island.jsx';
import DecodedParamsIsland from './decoded-params-island.jsx';
import RawFrameInspector from './raw-frame-inspector.jsx';

export const gridLayoutStoreName = 'ttnc-layouts';
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
    { i: 'metric-cards', x: 0, y: 0, w: 48, h: 23, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'telemetry-chart', x: 0, y: 23, w: 27, h: 27, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 27, y: 23, w: 21, h: 27, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 50, w: 48, h: 18, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  md: [
    { i: 'metric-cards', x: 0, y: 0, w: 40, h: 26, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'telemetry-chart', x: 0, y: 26, w: 40, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 50, w: 40, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 74, w: 40, h: 18, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  sm: [
    { i: 'metric-cards', x: 0, y: 0, w: 24, h: 32, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'telemetry-chart', x: 0, y: 32, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 54, w: 24, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 78, w: 24, h: 18, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 48, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'telemetry-chart', x: 0, y: 48, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 72, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 98, w: 8, h: 20, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xxs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 54, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'telemetry-chart', x: 0, y: 54, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 78, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 104, w: 8, h: 20, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
};

const TtncMainLayout = () => {
  const dispatch = useDispatch();
  const { socket } = useSocket();
  const isEditing = useSelector((state) => state.dashboard?.isEditing || state.telemetry?.gridEditable || false);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  const [layouts, setLayouts] = useState(() => {
    const loaded = loadLayoutsFromLocalStorage();
    return normalizeLayoutsResizeHandles(loaded ?? defaultLayouts);
  });

  // Listen to live Socket.IO telemetry events
  useEffect(() => {
    if (!socket) return;
    const handleLiveTelemetry = (eventData) => {
      dispatch(receiveLiveTelemetry(eventData));
    };
    socket.on('telemetry-live', handleLiveTelemetry);
    return () => {
      socket.off('telemetry-live', handleLiveTelemetry);
    };
  }, [socket, dispatch]);

  const handleLayoutsChange = useCallback((currentLayout, allLayouts) => {
    const normalized = normalizeLayoutsResizeHandles(allLayouts);
    setLayouts(normalized);
    saveLayoutsToLocalStorage(normalized);
  }, []);

  const gridContents = [
    <StyledIslandParentNoScrollbar key="metric-cards">
      <MetricCardsIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="telemetry-chart">
      <TelemetryChartIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="decoded-params">
      <DecodedParamsIsland gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="raw-frames">
      <RawFrameInspector gridEditable={isEditing} />
    </StyledIslandParentNoScrollbar>,
  ];

  return (
    <Box sx={{ width: '100%', height: '100%', p: 1.5, boxSizing: 'border-box' }}>
      <TtncTopBar />
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
};

export default TtncMainLayout;
