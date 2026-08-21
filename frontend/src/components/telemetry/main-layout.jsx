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
import TelemetrySingleChartIsland from './single-chart-island.jsx';
import DecodedParamsIsland from './decoded-params-island.jsx';
import RawFrameInspector from './raw-frame-inspector.jsx';

export const gridLayoutStoreName = 'ttnc-layouts';
const LAYOUT_SCHEMA_VERSION = 2;
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
    { i: 'chart-bus-v', x: 0, y: 22, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-i', x: 16, y: 22, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-batt-v', x: 32, y: 22, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-eps-temp', x: 0, y: 44, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-cdh-temp', x: 16, y: 44, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-solar-i', x: 32, y: 44, w: 16, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 66, w: 24, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 24, y: 66, w: 24, h: 26, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  md: [
    { i: 'metric-cards', x: 0, y: 0, w: 40, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-v', x: 0, y: 24, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-i', x: 20, y: 24, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-batt-v', x: 0, y: 46, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-eps-temp', x: 20, y: 46, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-cdh-temp', x: 0, y: 68, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-solar-i', x: 20, y: 68, w: 20, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 90, w: 40, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 114, w: 40, h: 20, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  sm: [
    { i: 'metric-cards', x: 0, y: 0, w: 24, h: 32, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-v', x: 0, y: 32, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-i', x: 0, y: 54, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-batt-v', x: 0, y: 76, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-eps-temp', x: 0, y: 98, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-cdh-temp', x: 0, y: 120, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-solar-i', x: 0, y: 142, w: 24, h: 22, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 164, w: 24, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 188, w: 24, h: 18, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 48, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-v', x: 0, y: 48, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-i', x: 0, y: 72, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-batt-v', x: 0, y: 96, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-eps-temp', x: 0, y: 120, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-cdh-temp', x: 0, y: 144, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-solar-i', x: 0, y: 168, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 192, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 218, w: 8, h: 20, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
  ],
  xxs: [
    { i: 'metric-cards', x: 0, y: 0, w: 8, h: 54, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-v', x: 0, y: 54, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-bus-i', x: 0, y: 78, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-batt-v', x: 0, y: 102, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-eps-temp', x: 0, y: 126, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-cdh-temp', x: 0, y: 150, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'chart-solar-i', x: 0, y: 174, w: 8, h: 24, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'decoded-params', x: 0, y: 198, w: 8, h: 26, minH: 12, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    { i: 'raw-frames', x: 0, y: 224, w: 8, h: 20, minH: 8, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
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
    <StyledIslandParentNoScrollbar key="chart-bus-v">
      <TelemetrySingleChartIsland
        field="sw_adcs_analogs_digital_bus_v"
        title="Bus Voltage"
        unit="V"
        color="#29b6f6"
        gridEditable={isEditing}
      />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="chart-bus-i">
      <TelemetrySingleChartIsland
        field="sw_ana_3p3_i"
        title="EPS Bus Current"
        unit="A"
        color="#00e676"
        gridEditable={isEditing}
      />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="chart-batt-v">
      <TelemetrySingleChartIsland
        field="sw_ana_bat1_v"
        title="Battery Voltage"
        unit="V"
        color="#ab47bc"
        gridEditable={isEditing}
      />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="chart-eps-temp">
      <TelemetrySingleChartIsland
        field="sw_ana_eps_temp"
        title="EPS Temperature"
        unit="°C"
        color="#ff5252"
        gridEditable={isEditing}
      />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="chart-cdh-temp">
      <TelemetrySingleChartIsland
        field="sw_ana_cdh_temp"
        title="CD&H OBC Temperature"
        unit="°C"
        color="#ff9800"
        gridEditable={isEditing}
      />
    </StyledIslandParentNoScrollbar>,
    <StyledIslandParentNoScrollbar key="chart-solar-i">
      <TelemetrySingleChartIsland
        field="sw_ana_axis1_curr"
        title="Solar Array Current"
        unit="mA"
        color="#ffd54f"
        gridEditable={isEditing}
      />
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
