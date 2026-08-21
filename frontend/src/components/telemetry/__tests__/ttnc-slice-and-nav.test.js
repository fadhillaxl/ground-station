import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import telemetryReducer, {
  setGridEditable,
  setSelectedSatellite,
  setHistoryField,
  setHistoryTimeRange,
  setAutoRefresh,
  receiveLiveTelemetry,
  clearTelemetryData,
} from '../telemetry-slice.jsx';
import { getNavigation } from '../../../config/navigation.jsx';

describe('telemetry slice & TTNC navigation', () => {
  it('should include ttnc in the navigation list', () => {
    const nav = getNavigation({ isAdmin: true });
    const ttncItem = nav.find((item) => item.segment === 'ttnc');
    expect(ttncItem).toBeDefined();
    expect(ttncItem.title).toBeDefined();
  });

  it('should initialize telemetry state with defaults', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    const state = store.getState().telemetry;
    expect(state.selectedSatelliteUid).toBe('bflu6sloxxslcd');
    expect(state.selectedSatelliteTitle).toBe('AEPEX');
    expect(state.gridEditable).toBe(false);
    expect(state.autoRefresh).toBe(true);
    expect(state.satellitesList.length).toBeGreaterThan(0);
  });

  it('should handle setGridEditable', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    store.dispatch(setGridEditable(true));
    expect(store.getState().telemetry.gridEditable).toBe(true);

    store.dispatch(setGridEditable(false));
    expect(store.getState().telemetry.gridEditable).toBe(false);
  });

  it('should handle setSelectedSatellite', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    store.dispatch(setSelectedSatellite({ dashboardUid: 'QGujdBBZk', title: 'AAUSAT4' }));
    const state = store.getState().telemetry;
    expect(state.selectedSatelliteUid).toBe('QGujdBBZk');
    expect(state.selectedSatelliteTitle).toBe('AAUSAT4');
  });

  it('should handle setHistoryField and setHistoryTimeRange', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    store.dispatch(setHistoryField('sw_ana_eps_temp'));
    store.dispatch(setHistoryTimeRange('now-7d'));
    const state = store.getState().telemetry;
    expect(state.historyField).toBe('sw_ana_eps_temp');
    expect(state.historyTimeRange).toBe('now-7d');
  });

  it('should handle setAutoRefresh and clearTelemetryData', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    store.dispatch(setAutoRefresh(false));
    expect(store.getState().telemetry.autoRefresh).toBe(false);

    store.dispatch(clearTelemetryData());
    expect(store.getState().telemetry.latestMetrics).toEqual({});
    expect(store.getState().telemetry.historyMetrics).toEqual([]);
    expect(store.getState().telemetry.rawFrames).toEqual([]);
  });

  it('should handle receiveLiveTelemetry for selected satellite', () => {
    const store = configureStore({
      reducer: { telemetry: telemetryReducer },
    });
    store.dispatch(
      receiveLiveTelemetry({
        satellite_id: 'bflu6sloxxslcd',
        data: {
          points: [{ metric_key: 'sw_ana_bus_v', value: 1750 }],
          raw: { packet_id: 1, val: 'raw_hex' },
        },
      })
    );

    const state = store.getState().telemetry;
    expect(state.latestMetrics['sw_ana_bus_v']).toBe(1750);
    expect(state.rawFrames.length).toBe(1);
    expect(state.rawFrames[0].raw).toEqual({ packet_id: 1, val: 'raw_hex' });
  });
});
