import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import rascubeReducer, {
  setConnectionState,
  setSerialNumber,
  setBaudRate,
  setGridEditable,
  receiveLiveTelemetry,
  receiveLiveCameraChunk,
  resetCameraState,
  addUplinkLog,
  clearUplinkLogs,
} from '../rascube-slice.jsx';
import { getNavigation } from '../../../config/navigation.jsx';

describe('RASCube slice & Navigation integration', () => {
  it('should include rascube in the navigation operationsSection', () => {
    const nav = getNavigation({ isAdmin: true });
    const rascubeItem = nav.find((item) => item.segment === 'rascube');
    expect(rascubeItem).toBeDefined();
    expect(rascubeItem.title).toBeDefined();
    expect(rascubeItem.icon).toBeDefined();
  });

  it('should initialize rascube state with correct default values', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    const state = store.getState().rascube;
    expect(state.isConnected).toBe(false);
    expect(state.serialNumber).toBe(1581);
    expect(state.baudRate).toBe(1000000);
    expect(state.gridEditable).toBe(false);
    expect(state.camera.status).toBe('idle');
    expect(state.camera.chunks).toEqual([]);
    expect(state.uplinkLogs).toEqual([]);
  });

  it('should handle setConnectionState', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(
      setConnectionState({
        isConnected: true,
        serialNumber: 1581,
        connectedPort: 'Client Web USB',
      })
    );
    const state = store.getState().rascube;
    expect(state.isConnected).toBe(true);
    expect(state.serialNumber).toBe(1581);
    expect(state.connectedPort).toBe('Client Web USB');
  });

  it('should handle setSerialNumber and setBaudRate', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(setSerialNumber(9999));
    store.dispatch(setBaudRate(115200));
    const state = store.getState().rascube;
    expect(state.serialNumber).toBe(9999);
    expect(state.baudRate).toBe(115200);
  });

  it('should handle setGridEditable toggle', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(setGridEditable(true));
    expect(store.getState().rascube.gridEditable).toBe(true);

    store.dispatch(setGridEditable(false));
    expect(store.getState().rascube.gridEditable).toBe(false);
  });

  it('should handle receiveLiveTelemetry and update history buffer', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    const dummySample = {
      packet_sequence: 123,
      uptime_seconds: 45.6,
      eps: { main_5v_v: 5.01, main_3v3_v: 3.29 },
      environment: { temperature_c: 24.2, pressure_hpa: 1013.2 },
      raw_hex: '1079...',
    };
    store.dispatch(receiveLiveTelemetry(dummySample));

    const state = store.getState().rascube;
    expect(state.isConnected).toBe(true);
    expect(state.latestTelemetry.packet_sequence).toBe(123);
    expect(state.latestTelemetry.environment.temperature_c).toBe(24.2);
    expect(state.telemetryHistory.length).toBe(1);
  });

  it('should handle receiveLiveCameraChunk and progressive updates', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(
      receiveLiveCameraChunk({
        type: 'camera_chunk',
        index: 0,
        size: 240,
        total_blocks: 1,
        total_bytes: 240,
        elapsed_seconds: 0.5,
        partial_jpeg_base64: '/9j/4AAQSkZJRg...',
      })
    );

    const state = store.getState().rascube;
    expect(state.camera.chunks.length).toBe(1);
    expect(state.camera.chunks[0].index).toBe(0);
    expect(state.camera.progress.blocks_received).toBe(1);
    expect(state.camera.progress.total_bytes).toBe(240);
    expect(state.camera.partialImageBase64).toBe('/9j/4AAQSkZJRg...');
  });

  it('should handle resetCameraState', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(resetCameraState());
    const state = store.getState().rascube;
    expect(state.camera.status).toBe('capturing');
    expect(state.camera.chunks).toEqual([]);
    expect(state.camera.partialImageBase64).toBeNull();
  });

  it('should handle addUplinkLog and clearUplinkLogs', () => {
    const store = configureStore({
      reducer: { rascube: rascubeReducer },
    });
    store.dispatch(
      addUplinkLog({
        type: 'LED',
        message: 'Blink LED sent',
        hex: '8003FF0000',
        status: 'success',
      })
    );
    let state = store.getState().rascube;
    expect(state.uplinkLogs.length).toBe(1);
    expect(state.uplinkLogs[0].type).toBe('LED');
    expect(state.uplinkLogs[0].hex).toBe('8003FF0000');

    store.dispatch(clearUplinkLogs());
    state = store.getState().rascube;
    expect(state.uplinkLogs.length).toBe(0);
  });
});
