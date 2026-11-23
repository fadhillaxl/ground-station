import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { setupTheme } from '../../../theme.js';
import SstvPage from '../sstv-page.jsx';
import { isIcomAudioDevice } from '../useAudioProcessor.ts';
import { SSTVDecoder, DecoderState } from '../lib/decoder.ts';
import { getNavigation } from '../../../config/navigation.jsx';

function createMockStore() {
    return configureStore({
        reducer: {
            dashboard: () => ({ isEditing: false }),
            waterfall: () => ({ gridEditable: false }),
        },
    });
}

describe('SstvPage (Dynamic Waterfall-style Grid Layout + smolgroot DSP engine)', () => {
    it('renders the dynamic react-grid-layout SSTV islands with Auto Detect mode by default', () => {
        const store = createMockStore();
        const theme = setupTheme('dark');
        render(
            <Provider store={store}>
                <ThemeProvider theme={theme}>
                    <MemoryRouter>
                        <SstvPage />
                    </MemoryRouter>
                </ThemeProvider>
            </Provider>
        );
        expect(screen.getByText(/SSTV Live Decoder/i)).toBeTruthy();
        expect(screen.getByText('Settings')).toBeTruthy();
        expect(screen.getByText('Audio Source (IC-9700)')).toBeTruthy();
        expect(
            screen.getByText(
                /\[SERVER • COM4\] Icom IC-9700 USB Audio CODEC \(Server • rigctld: COM3\)/i
            )
        ).toBeTruthy();
        expect(screen.getByText('SERVER ICOM IC-9700 USB PORTS')).toBeTruthy();
        expect(screen.getAllByText('Auto Detect (SSTV Signal)').length).toBeGreaterThan(0);
        expect(screen.getByText('Audio Analysis')).toBeTruthy();
        expect(screen.getByText('Waveform & Spectrum')).toBeTruthy();
        expect(screen.getByText('Spectrogram Waterfall')).toBeTruthy();
    });

    it('does not decode lines on random background noise before an SSTV signal is detected', () => {
        const decoder = new SSTVDecoder(44100, 'ROBOT36', true);
        decoder.start();
        expect(decoder.getStats().state).toBe(DecoderState.LISTENING);

        // Feed 1 second of random background noise
        const noise = new Float32Array(44100);
        for (let i = 0; i < noise.length; i += 1) {
            noise[i] = (Math.random() - 0.5) * 0.05;
        }
        decoder.processSamples(noise);

        // Must stay in LISTENING state with 0 decoded lines
        expect(decoder.getStats().state).toBe(DecoderState.LISTENING);
        expect(decoder.getStats().currentLine).toBe(0);
    });

    it('detects Icom / USB Audio CODEC labels accurately', () => {
        expect(isIcomAudioDevice('USB Audio CODEC (08bb:2901)')).toBe(true);
        expect(isIcomAudioDevice('Burr-Brown from TI USB Audio CODEC')).toBe(true);
        expect(isIcomAudioDevice('Icom IC-9700 Audio')).toBe(true);
        expect(isIcomAudioDevice('MacBook Pro Microphone')).toBe(false);
    });

    it('includes SSTV item in the main sidebar navigation', () => {
        const navItems = getNavigation({ isAdmin: false });
        const sstvItem = navItems.find((item) => item.segment === 'sstv-decoder');
        expect(sstvItem).toBeTruthy();
        expect(sstvItem.title).toBe('SSTV');
    });
});
