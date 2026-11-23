/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CropFreeIcon from '@mui/icons-material/CropFree';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { UnfoldMore, UnfoldLess } from '@mui/icons-material';
import {
    AntTab,
    AntTabs,
    getClassNamesBasedOnGridEditing,
    StyledIslandParentScrollbar,
    TitleBar,
    WaterfallStatusBarPaper,
} from '../common/common.jsx';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from '../waterfall/settings-elements.jsx';
import { useAudioProcessor } from './useAudioProcessor.ts';

export const gridLayoutStoreName = 'sstv-view-layouts';
const LAYOUT_SCHEMA_VERSION = 1;
const SHARED_RESIZE_HANDLES = ['s', 'sw', 'w', 'se', 'nw', 'ne', 'e'];

const defaultLayouts = {
    lg: [
        {
            i: 'sstv-display',
            x: 0,
            y: 0,
            w: 39,
            h: 43,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-settings',
            x: 39,
            y: 0,
            w: 9,
            h: 43,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-insights',
            x: 0,
            y: 43,
            w: 48,
            h: 15,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
    ],
    md: [
        {
            i: 'sstv-display',
            x: 0,
            y: 0,
            w: 28,
            h: 42,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-settings',
            x: 28,
            y: 0,
            w: 12,
            h: 42,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-insights',
            x: 0,
            y: 42,
            w: 40,
            h: 17,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
    ],
    sm: [
        {
            i: 'sstv-display',
            x: 0,
            y: 0,
            w: 17,
            h: 41,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-settings',
            x: 17,
            y: 0,
            w: 7,
            h: 41,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-insights',
            x: 0,
            y: 41,
            w: 24,
            h: 15,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
    ],
    xs: [
        {
            i: 'sstv-display',
            x: 0,
            y: 0,
            w: 8,
            h: 42,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-settings',
            x: 0,
            y: 42,
            w: 8,
            h: 33,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-insights',
            x: 0,
            y: 75,
            w: 8,
            h: 16,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
    ],
    xxs: [
        {
            i: 'sstv-display',
            x: 0,
            y: 0,
            w: 8,
            h: 33,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-settings',
            x: 0,
            y: 33,
            w: 8,
            h: 24,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
        {
            i: 'sstv-insights',
            x: 0,
            y: 57,
            w: 8,
            h: 18,
            moved: false,
            static: false,
            resizeHandles: [...SHARED_RESIZE_HANDLES],
        },
    ],
};

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
    try {
        localStorage.setItem(
            gridLayoutStoreName,
            JSON.stringify({
                version: LAYOUT_SCHEMA_VERSION,
                layouts,
            })
        );
    } catch {
        // Ignore storage quota errors
    }
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

export const MODES_LIST = [
    {
        id: 'AUTO',
        name: 'Auto Detect (SSTV Signal)',
        shortLabel: 'Auto Detect',
        resolution: 'Auto',
        description: 'Auto-detects SSTV signal & mode (Robot 36/72, Scottie S1/S2, PD 120/160/180) before decoding',
    },
    {
        id: 'ROBOT36',
        name: 'Robot 36',
        shortLabel: 'Robot36 Mode',
        resolution: '320×240',
        description: '320×240 • Fast mode (150ms/line) • Interlaced YUV',
    },
    {
        id: 'ROBOT72',
        name: 'Robot 72',
        shortLabel: 'Robot72 Mode',
        resolution: '320×240',
        description: '320×240 • Better color (300ms/line) • Sequential YUV',
    },
    {
        id: 'SCOTTIE_S1',
        name: 'Scottie S1',
        shortLabel: 'Scottie S1 Mode',
        resolution: '320×256',
        description: '320×256 • HF classic (428ms/line) • RGB sequential',
    },
    {
        id: 'SCOTTIE_S2',
        name: 'Scottie S2',
        shortLabel: 'Scottie S2 Mode',
        resolution: '320×256',
        description: '320×256 • Faster HF (278ms/line) • RGB sequential',
    },
    {
        id: 'PD120',
        name: 'PD 120 (ISS)',
        shortLabel: 'PD120 Mode',
        resolution: '640×496',
        description: '640×496 • High resolution (508ms/line) • Dual-luminance',
    },
    {
        id: 'PD160',
        name: 'PD 160',
        shortLabel: 'PD160 Mode',
        resolution: '512×400',
        description: '512×400 • Balanced mode (804ms/line) • Dual-luminance',
    },
    {
        id: 'PD180',
        name: 'PD 180',
        shortLabel: 'PD180 Mode',
        resolution: '640×496',
        description: '640×496 • Highest quality (752ms/line) • Dual-luminance',
    },
];

const COLOR_PALETTES = {
    default: { name: 'Normal (Visible)', filter: 'none' },
    grayscale: { name: 'Grayscale', filter: 'grayscale(1)' },
    contrast: { name: 'High Contrast', filter: 'contrast(1.4) brightness(0.95)' },
    thermal: { name: 'Thermal IR (False Color)', filter: 'invert(1) hue-rotate(180deg) saturate(1.8)' },
    infrared: { name: 'Infrared Lookup', filter: 'contrast(1.2) sepia(0.8) hue-rotate(290deg) saturate(1.5)' },
};

const ALL_ACCORDION_PANELS = ['audioSource', 'sstvMode', 'enhancement', 'diagnostics'];

export default function SstvPage() {
    const theme = useTheme();
    const navigate = useNavigate();

    // Respect global Edit Layout mode from the top AppBar (just like /waterfall)
    const gridEditable = useSelector((state) =>
        Boolean(state.dashboard?.isEditing || state.waterfall?.gridEditable)
    );

    const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return normalizeLayoutsResizeHandles(loaded ?? defaultLayouts);
    });

    const handleLayoutsChange = useCallback((currentLayout, allLayouts) => {
        const normalized = normalizeLayoutsResizeHandles(allLayouts);
        setLayouts(normalized);
    }, []);

    useEffect(() => {
        saveLayoutsToLocalStorage(layouts);
    }, [layouts]);

    const [selectedMode, setSelectedMode] = useState('AUTO');
    const [selectedPalette, setSelectedPalette] = useState('default');
    const [expandedPanels, setExpandedPanels] = useState(ALL_ACCORDION_PANELS);
    const [activeBottomTab, setActiveBottomTab] = useState('waveform');
    const [showBandscopeStrip, setShowBandscopeStrip] = useState(true);

    // Interactive viewport pan / zoom / rotation state
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);

    const canvasRef = useRef(null);
    const bandscopeCanvasRef = useRef(null);
    const spectrumCanvasRef = useRef(null);
    const spectrogramCanvasRef = useRef(null);
    const waveformCanvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const waveformHistoryRef = useRef([]);

    const {
        state,
        audioDevices,
        selectedDeviceId,
        setSelectedDeviceId,
        refreshAudioDevices,
        startRecording,
        stopRecording,
        resetDecoder,
        getImageData,
        getDimensions,
        getAnalyser,
    } = useAudioProcessor(selectedMode);

    const modeInfo = MODES_LIST.find((m) => m.id === selectedMode) || MODES_LIST[0];
    const dimensions = getDimensions();

    const toggleAccordionPanel = (panelKey) => {
        setExpandedPanels((prev) =>
            prev.includes(panelKey) ? prev.filter((p) => p !== panelKey) : [...prev, panelKey]
        );
    };

    const handleToggleAllAccordions = () => {
        if (expandedPanels.length === ALL_ACCORDION_PANELS.length) {
            setExpandedPanels([]);
        } else {
            setExpandedPanels([...ALL_ACCORDION_PANELS]);
        }
    };

    const handleModeChange = (event) => {
        const newMode = event.target.value;
        if (state.isRecording) {
            stopRecording();
        }
        setSelectedMode(newMode);
    };

    const handleAudioDeviceChange = async (event) => {
        const nextDeviceId = event.target.value;
        setSelectedDeviceId(nextDeviceId);
        if (state.isRecording) {
            stopRecording();
            await startRecording(nextDeviceId);
        }
    };

    const handleAutoFit = useCallback(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setRotation(0);
    }, []);

    // Draw spectrum visualization with frequency axis
    const drawSpectrum = useCallback(
        (canvas) => {
            const analyser = getAnalyser();
            if (!analyser || !canvas) return null;

            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            const sampleRate = analyser.context.sampleRate;
            const nyquist = sampleRate / 2;

            const axisHeight = 20;
            const plotHeight = canvas.height - axisHeight;

            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Highlight SSTV passband (1200 Hz - 2300 Hz)
            const x1200 = (1200 / nyquist) * canvas.width;
            const x2300 = (2300 / nyquist) * canvas.width;
            ctx.fillStyle = 'rgba(0, 229, 255, 0.06)';
            ctx.fillRect(x1200, 0, Math.max(2, x2300 - x1200), plotHeight);

            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            const barWidth = canvas.width / bufferLength;
            for (let i = 0; i < bufferLength; i += 1) {
                const barHeight = (dataArray[i] / 255) * plotHeight;
                const x = i * barWidth;
                const y = plotHeight - barHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();

            ctx.fillStyle = '#8b949e';
            ctx.strokeStyle = '#2d2d35';
            ctx.lineWidth = 1;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';

            ctx.beginPath();
            ctx.moveTo(0, plotHeight);
            ctx.lineTo(canvas.width, plotHeight);
            ctx.stroke();

            const pixelsPerLabel = 90;
            const numLabels = Math.max(1, Math.floor(canvas.width / pixelsPerLabel));
            const freqStep = Math.ceil(nyquist / numLabels / 1000) * 1000;

            for (let freq = 0; freq <= nyquist; freq += freqStep) {
                const binIndex = Math.floor((freq / nyquist) * bufferLength);
                const xPos = (binIndex / bufferLength) * canvas.width;

                ctx.beginPath();
                ctx.moveTo(xPos, plotHeight);
                ctx.lineTo(xPos, plotHeight + 4);
                ctx.stroke();

                const label = freq >= 1000 ? `${(freq / 1000).toFixed(1)}k` : `${freq}`;
                ctx.fillText(label, xPos, plotHeight + 14);
            }

            ctx.textAlign = 'right';
            ctx.fillText('Hz', canvas.width - 5, plotHeight + 14);

            return dataArray;
        },
        [getAnalyser]
    );

    // Draw spectrogram (scrolling waterfall display)
    const drawSpectrogram = useCallback((canvas, frequencyData) => {
        if (!canvas || !frequencyData) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height - 1);
        ctx.putImageData(imageData, 0, 1);

        const barWidth = canvas.width / frequencyData.length;

        for (let i = 0; i < frequencyData.length; i += 1) {
            const value = frequencyData[i];
            let r;
            let g;
            let b;
            if (value < 85) {
                r = 0;
                g = 0;
                b = value * 3;
            } else if (value < 170) {
                r = 0;
                g = (value - 85) * 3;
                b = 255 - (value - 85) * 3;
            } else {
                r = (value - 170) * 3;
                g = 255;
                b = 0;
            }

            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(i * barWidth, 0, Math.ceil(barWidth), 1);
        }
    }, []);

    // Draw waveform timeline
    const drawWaveform = useCallback(
        (canvas) => {
            const analyser = getAnalyser();
            if (!analyser || !canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(dataArray);

            const maxHistory = 300;
            waveformHistoryRef.current.push(dataArray.slice());
            if (waveformHistoryRef.current.length > maxHistory) {
                waveformHistoryRef.current.shift();
            }

            const history = waveformHistoryRef.current;
            if (history.length === 0) return;

            const axisHeight = 18;
            const plotHeight = canvas.height - axisHeight;

            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#2d2d35';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, plotHeight / 2);
            ctx.lineTo(canvas.width, plotHeight / 2);
            ctx.stroke();

            const pixelsPerFrame = canvas.width / maxHistory;

            ctx.strokeStyle = '#4caf50';
            ctx.lineWidth = 1.5;

            for (let frameIdx = 0; frameIdx < history.length; frameIdx += 1) {
                const frame = history[frameIdx];
                const x = frameIdx * pixelsPerFrame;
                const samplesPerPixel = Math.max(1, Math.floor(frame.length / pixelsPerFrame));

                ctx.beginPath();
                ctx.moveTo(x, plotHeight / 2);

                for (let px = 0; px < pixelsPerFrame; px += 1) {
                    const sampleStart = Math.floor(px * samplesPerPixel);
                    const sampleEnd = Math.min(sampleStart + samplesPerPixel, frame.length);

                    let min = 1;
                    let max = -1;

                    for (let i = sampleStart; i < sampleEnd; i += 1) {
                        const sample = frame[i];
                        if (sample < min) min = sample;
                        if (sample > max) max = sample;
                    }

                    const xPos = x + px;
                    const yMin = plotHeight / 2 - (min * plotHeight) / 2;
                    const yMax = plotHeight / 2 - (max * plotHeight) / 2;

                    ctx.moveTo(xPos, yMin);
                    ctx.lineTo(xPos, yMax);
                }

                ctx.stroke();
            }
        },
        [getAnalyser]
    );

    const isRecordingRef = useRef(state.isRecording);
    useEffect(() => {
        isRecordingRef.current = state.isRecording;
    }, [state.isRecording]);

    // Update canvas with decoded image from smolgroot/sstv-decoder DSP engine.
    // Include `mounted` so the RAF loop starts as soon as `useContainerWidth` mounts the grid canvases.
    useEffect(() => {
        if (!mounted) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        const dims = getDimensions();

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = dims.width;
        offscreenCanvas.height = dims.height;
        const offscreenCtx = offscreenCanvas.getContext('2d');
        if (!offscreenCtx) return undefined;

        ctx.imageSmoothingEnabled = false;
        offscreenCtx.imageSmoothingEnabled = false;

        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        offscreenCtx.fillStyle = '#0d1117';
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        const updateCanvas = () => {
            const imageData = getImageData();
            const liveDims = getDimensions();

            if (imageData && offscreenCtx) {
                if (offscreenCanvas.width !== liveDims.width || offscreenCanvas.height !== liveDims.height) {
                    offscreenCanvas.width = liveDims.width;
                    offscreenCanvas.height = liveDims.height;
                    offscreenCtx.imageSmoothingEnabled = false;
                }
                if (canvas.width !== liveDims.width || canvas.height !== liveDims.height) {
                    canvas.width = liveDims.width;
                    canvas.height = liveDims.height;
                    ctx.imageSmoothingEnabled = false;
                }
                const imgData = new ImageData(
                    new Uint8ClampedArray(imageData),
                    liveDims.width,
                    liveDims.height
                );
                offscreenCtx.putImageData(imgData, 0, 0);
                ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
            }

            if (isRecordingRef.current) {
                let frequencyData = null;
                if (bandscopeCanvasRef.current) {
                    frequencyData = drawSpectrum(bandscopeCanvasRef.current);
                }
                if (spectrumCanvasRef.current) {
                    frequencyData = drawSpectrum(spectrumCanvasRef.current) || frequencyData;
                }
                if (spectrogramCanvasRef.current && frequencyData) {
                    drawSpectrogram(spectrogramCanvasRef.current, frequencyData);
                }
                if (waveformCanvasRef.current) {
                    drawWaveform(waveformCanvasRef.current);
                }
            }

            animationFrameRef.current = requestAnimationFrame(updateCanvas);
        };

        animationFrameRef.current = requestAnimationFrame(updateCanvas);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [
        mounted,
        selectedMode,
        getImageData,
        getDimensions,
        drawSpectrum,
        drawSpectrogram,
        drawWaveform,
    ]);

    const handleStart = async () => {
        await startRecording();
    };

    const handleStop = () => {
        stopRecording();
    };

    const handleReset = () => {
        resetDecoder();
        waveformHistoryRef.current = [];
        handleAutoFit();
    };

    const handleSaveImage = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            link.download = `sstv-decode-${selectedMode.toLowerCase()}-${timestamp}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    };

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const snrValue = typeof state.stats?.snr === 'number' ? state.stats.snr : 0.0;
    const currentLine = state.stats?.currentLine ?? 0;
    const totalLines = state.stats?.totalLines ?? dimensions.height;
    const isSyncLocked = Boolean(state.isRecording && state.stats?.state === 'DECODING_IMAGE');
    const detectedModeLabel =
        isSyncLocked || currentLine > 0
            ? `${state.stats?.mode || modeInfo.name}${selectedMode === 'AUTO' ? ' (Auto)' : ''}`
            : modeInfo.name;
    const progressPct = state.stats?.progress ?? 0;
    const signalStrength = state.stats?.signalStrength ?? 0;

    const getSnrColor = (val) => {
        if (val >= 14) return 'success';
        if (val >= 7) return 'warning';
        return 'error';
    };

    return (
        <div ref={containerRef} data-tour="sstv-decoder-panel">
            {mounted ? (
                <Responsive
                    width={width}
                    className="layout"
                    layouts={layouts}
                    onLayoutChange={handleLayoutsChange}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 48, md: 40, sm: 24, xs: 8, xxs: 8 }}
                    rowHeight={8}
                    dragConfig={{ enabled: gridEditable, handle: '.react-grid-draggable' }}
                    resizeConfig={{ enabled: gridEditable }}
                >
                    {/* ISLAND 1: Main SSTV Display + Toolbar + Status Bar (matches MainWaterfallDisplay) */}
                    <StyledIslandParentScrollbar key="sstv-display">
                        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                            <TitleBar
                                className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                        SSTV Live Decoder — {detectedModeLabel} ({dimensions.width}×{dimensions.height})
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                        {state.activeDeviceLabel || 'Icom IC-9700 (USB Audio CODEC)'}
                                    </Typography>
                                </Box>
                            </TitleBar>

                            {/* Waterfall-style Icon Toolbar */}
                            <Paper
                                elevation={1}
                                sx={{
                                    p: 0,
                                    display: 'inline-block',
                                    width: '100%',
                                    borderBottom: '1px solid',
                                    borderColor: 'border.main',
                                    borderRadius: 0,
                                }}
                            >
                                <Stack direction="row" spacing={0} sx={{ alignItems: 'center', flexWrap: 'nowrap' }}>
                                    <IconButton
                                        disabled={!state.isSupported || state.isRecording}
                                        onClick={handleStart}
                                        title="Start Decoding"
                                        aria-label="Start Decoding"
                                        sx={{
                                            borderRadius: 0,
                                            color: 'action.play',
                                            '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.08)' },
                                        }}
                                    >
                                        <PlayArrowIcon />
                                    </IconButton>

                                    <IconButton
                                        disabled={!state.isRecording}
                                        onClick={handleStop}
                                        title="Stop Decoding"
                                        aria-label="Stop"
                                        sx={{
                                            borderRadius: 0,
                                            color: 'action.stop',
                                            '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.08)' },
                                        }}
                                    >
                                        <StopIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={handleReset}
                                        color="primary"
                                        title="Reset Decoder Canvas"
                                        aria-label="Reset"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <RestartAltIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={() => setScale((s) => Math.min(s * 1.2, 10))}
                                        color="primary"
                                        title="Zoom In"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <ZoomInIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={() => setScale((s) => Math.max(s / 1.2, 0.25))}
                                        color="primary"
                                        title="Zoom Out"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <ZoomOutIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={handleAutoFit}
                                        color="primary"
                                        title="Reset Zoom / Fit"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <CropFreeIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={() => setRotation((r) => (r + 90) % 360)}
                                        color="primary"
                                        title="Rotate 90°"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <RotateRightIcon />
                                    </IconButton>

                                    <IconButton
                                        onClick={handleSaveImage}
                                        color="primary"
                                        title="Save Image (PNG)"
                                        aria-label="Save Image"
                                        sx={{ borderRadius: 0 }}
                                    >
                                        <CameraAltIcon />
                                    </IconButton>

                                    <Box sx={{ ml: 'auto', pr: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Chip
                                            size="small"
                                            label={
                                                isSyncLocked
                                                    ? `SSTV DETECTED • ${state.stats?.mode || modeInfo.name}`
                                                    : state.isRecording
                                                      ? 'WAITING FOR SSTV SIGNAL'
                                                      : 'IDLE'
                                            }
                                            color={isSyncLocked ? 'success' : state.isRecording ? 'info' : 'default'}
                                            sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
                                        />
                                    </Box>
                                </Stack>
                            </Paper>

                            {state.error && (
                                <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>
                                    {state.error}
                                </Alert>
                            )}

                            {/* Interactive Decoded SSTV Canvas Viewport */}
                            <Box
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    width: '100%',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#0d1117',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    p: 1.5,
                                    position: 'relative',
                                }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            >
                                <canvas
                                    ref={canvasRef}
                                    width={dimensions.width}
                                    height={dimensions.height}
                                    style={{
                                        height: '100%',
                                        width: 'auto',
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                                        objectFit: 'contain',
                                        imageRendering: 'pixelated',
                                        filter: COLOR_PALETTES[selectedPalette]?.filter || 'none',
                                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
                                        transition: isDragging ? 'none' : 'transform 120ms ease-out',
                                        border: '1px solid rgba(255, 255, 255, 0.16)',
                                    }}
                                />

                                {currentLine === 0 && (
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            pointerEvents: 'none',
                                            textAlign: 'center',
                                            px: 2.5,
                                            py: 1.5,
                                            borderRadius: 1.5,
                                            bgcolor: 'rgba(13, 17, 23, 0.78)',
                                            border: '1px solid rgba(255, 255, 255, 0.12)',
                                        }}
                                    >
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: state.isRecording ? 'info.main' : 'text.secondary',
                                                display: 'block',
                                            }}
                                        >
                                            {state.isRecording
                                                ? `LISTENING — WAITING FOR 1200 Hz SSTV SYNC PULSE (${modeInfo.name})`
                                                : `IDLE — CLICK PLAY TO START SSTV DECODING (${modeInfo.name} • ${dimensions.width}×${dimensions.height})`}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{ color: 'text.secondary', fontSize: '0.7rem', display: 'block', mt: 0.25 }}
                                        >
                                            Input: {state.activeDeviceLabel || 'Icom IC-9700 (USB Audio CODEC — Auto Detect)'}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            {/* Optional Live Bandscope Strip above Status Bar */}
                            {showBandscopeStrip && (
                                <Box
                                    sx={{
                                        height: 92,
                                        borderTop: `1px solid ${theme.palette.border.main}`,
                                        backgroundColor: '#0d1117',
                                    }}
                                >
                                    <canvas
                                        ref={bandscopeCanvasRef}
                                        width={760}
                                        height={92}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            display: 'block',
                                        }}
                                    />
                                </Box>
                            )}

                            {/* Bottom Status Bar (matches WaterfallStatusBarPaper) */}
                            <WaterfallStatusBarPaper
                                elevation={0}
                                sx={{
                                    height: 30,
                                    minHeight: 30,
                                    borderTop: `1px solid ${theme.palette.border.main}`,
                                    borderBottom: 'none',
                                    px: 1,
                                    overflow: 'hidden',
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        fontSize: '0.72rem',
                                        fontFamily: 'monospace',
                                        color: 'text.secondary',
                                        width: '100%',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.68rem' }}
                                    >
                                        SSTV
                                    </Typography>
                                    <Box component="span" sx={{ opacity: 0.55 }}>•</Box>
                                    <Box component="span">
                                        state:{' '}
                                        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                            {isSyncLocked
                                                ? 'DECODING_IMAGE'
                                                : state.isRecording
                                                  ? 'LISTENING_FOR_SYNC'
                                                  : 'IDLE'}
                                        </Box>
                                    </Box>
                                    <Box component="span" sx={{ opacity: 0.55 }}>•</Box>
                                    <Box component="span">
                                        mode: <Box component="span" sx={{ fontWeight: 700 }}>{detectedModeLabel}</Box>
                                    </Box>
                                    <Box component="span" sx={{ opacity: 0.55 }}>•</Box>
                                    <Box component="span">
                                        line:{' '}
                                        <Box component="span" sx={{ fontWeight: 700 }}>
                                            {currentLine}/{totalLines} ({Math.round(progressPct)}%)
                                        </Box>
                                    </Box>
                                    <Box component="span" sx={{ opacity: 0.55 }}>•</Box>
                                    <Box component="span">
                                        snr:{' '}
                                        <Box component="span" sx={{ fontWeight: 700 }}>
                                            {state.stats?.snr !== null && state.stats?.snr !== undefined
                                                ? `${snrValue.toFixed(1)} dB`
                                                : '-- dB'}
                                        </Box>
                                    </Box>
                                    <Box component="span" sx={{ opacity: 0.55 }}>•</Box>
                                    <Box component="span">
                                        sig: <Box component="span" sx={{ fontWeight: 700 }}>{signalStrength}%</Box>
                                    </Box>
                                </Box>
                            </WaterfallStatusBarPaper>
                        </Box>
                    </StyledIslandParentScrollbar>

                    {/* ISLAND 2: Right Settings Column with Accordions (matches WaterfallSettings) */}
                    <StyledIslandParentScrollbar key="sstv-settings">
                        <TitleBar
                            className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}
                        >
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    width: '100%',
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                    Settings
                                </Typography>
                                <IconButton
                                    size="small"
                                    onClick={handleToggleAllAccordions}
                                    sx={{ p: 0, minWidth: 0, width: 20, height: 20 }}
                                    title={
                                        expandedPanels.length === ALL_ACCORDION_PANELS.length
                                            ? 'Collapse All'
                                            : 'Expand All'
                                    }
                                >
                                    {expandedPanels.length === ALL_ACCORDION_PANELS.length ? (
                                        <UnfoldLess sx={{ fontSize: 16 }} />
                                    ) : (
                                        <UnfoldMore sx={{ fontSize: 16 }} />
                                    )}
                                </IconButton>
                            </Box>
                        </TitleBar>

                        <div style={{ overflowY: 'auto', height: '100%', paddingBottom: '29px' }}>
                            {/* Accordion 1: Audio Source (Icom IC-9700 USB Audio CODEC) */}
                            <Accordion
                                expanded={expandedPanels.includes('audioSource')}
                                onChange={() => toggleAccordionPanel('audioSource')}
                            >
                                <AccordionSummary>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                        Audio Source (IC-9700)
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Stack spacing={1.5}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="sstv-audio-source-label">Audio Input Device</InputLabel>
                                            <Select
                                                labelId="sstv-audio-source-label"
                                                id="sstv-audio-source-select"
                                                value={selectedDeviceId}
                                                label="Audio Input Device"
                                                onChange={handleAudioDeviceChange}
                                            >
                                                <MenuItem value="icom-auto">
                                                    Icom IC-9700 (USB Audio CODEC — Auto Detect)
                                                </MenuItem>
                                                <MenuItem value="default">
                                                    System Default Microphone / Line-In
                                                </MenuItem>
                                                {audioDevices.map((dev) => (
                                                    <MenuItem key={dev.deviceId} value={dev.deviceId}>
                                                        {dev.isIcomCodec
                                                            ? `[ICOM / USB CODEC] ${dev.label}`
                                                            : dev.label}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>

                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                fullWidth
                                                size="small"
                                                variant="outlined"
                                                startIcon={<RefreshIcon fontSize="small" />}
                                                onClick={() => refreshAudioDevices(true)}
                                            >
                                                Detect USB Audio
                                            </Button>
                                            <Tooltip title="Hardware Rigs Settings">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => navigate('/admin/system/hardware/rigs')}
                                                    sx={{ border: '1px solid', borderColor: 'divider' }}
                                                >
                                                    <SettingsIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>

                                        <Stack direction="row" spacing={1}>
                                            {!state.isRecording ? (
                                                <Button
                                                    fullWidth
                                                    size="small"
                                                    variant="contained"
                                                    color="success"
                                                    startIcon={<PlayArrowIcon />}
                                                    onClick={handleStart}
                                                    disabled={!state.isSupported}
                                                >
                                                    Start Decoding
                                                </Button>
                                            ) : (
                                                <Button
                                                    fullWidth
                                                    size="small"
                                                    variant="contained"
                                                    color="error"
                                                    startIcon={<StopIcon />}
                                                    onClick={handleStop}
                                                >
                                                    Stop
                                                </Button>
                                            )}
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={handleReset}
                                            >
                                                Reset
                                            </Button>
                                        </Stack>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>

                            {/* Accordion 2: SSTV Mode */}
                            <Accordion
                                expanded={expandedPanels.includes('sstvMode')}
                                onChange={() => toggleAccordionPanel('sstvMode')}
                            >
                                <AccordionSummary>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                        SSTV Mode
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Stack spacing={1.5}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="sstv-mode-select-label">Transmission Mode</InputLabel>
                                            <Select
                                                labelId="sstv-mode-select-label"
                                                id="sstv-mode-select"
                                                value={selectedMode}
                                                label="Transmission Mode"
                                                onChange={handleModeChange}
                                                disabled={state.isRecording}
                                            >
                                                {MODES_LIST.map((m) => (
                                                    <MenuItem key={m.id} value={m.id}>
                                                        {m.id === 'AUTO' ? m.name : `${m.name} (${m.resolution})`}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>

                                        <Typography variant="caption" color="text.secondary">
                                            {modeInfo.description}
                                        </Typography>

                                        <Button
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            startIcon={<DownloadIcon fontSize="small" />}
                                            onClick={handleSaveImage}
                                        >
                                            Save Image
                                        </Button>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>

                            {/* Accordion 3: Enhancement & Display */}
                            <Accordion
                                expanded={expandedPanels.includes('enhancement')}
                                onChange={() => toggleAccordionPanel('enhancement')}
                            >
                                <AccordionSummary>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                        Enhancement Palettes
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Stack spacing={1.25}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="sstv-palette-select-label">Color Filter</InputLabel>
                                            <Select
                                                labelId="sstv-palette-select-label"
                                                value={selectedPalette}
                                                label="Color Filter"
                                                onChange={(e) => setSelectedPalette(e.target.value)}
                                            >
                                                {Object.entries(COLOR_PALETTES).map(([key, val]) => (
                                                    <MenuItem key={key} value={key}>
                                                        {val.name}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>

                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    size="small"
                                                    checked={showBandscopeStrip}
                                                    onChange={(e) => setShowBandscopeStrip(e.target.checked)}
                                                />
                                            }
                                            label={
                                                <Typography variant="caption">
                                                    Show Bandscope Strip
                                                </Typography>
                                            }
                                        />
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>

                            {/* Accordion 4: Signal & Demodulator Diagnostics */}
                            <Accordion
                                expanded={expandedPanels.includes('diagnostics')}
                                onChange={() => toggleAccordionPanel('diagnostics')}
                            >
                                <AccordionSummary>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                        Signal & Demodulator Diagnostics
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Stack spacing={1.25}>
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Typography variant="caption" color="text.secondary">
                                                Sync Lock
                                            </Typography>
                                            <Chip
                                                icon={
                                                    isSyncLocked ? (
                                                        <LockIcon fontSize="small" />
                                                    ) : (
                                                        <LockOpenIcon fontSize="small" />
                                                    )
                                                }
                                                label={isSyncLocked ? 'LOCKED' : 'WAITING'}
                                                color={isSyncLocked ? 'success' : 'default'}
                                                size="small"
                                                variant={isSyncLocked ? 'filled' : 'outlined'}
                                                sx={{ height: 20, fontSize: '0.65rem' }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    SNR (Live)
                                                </Typography>
                                                <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                    {state.stats?.snr !== null && state.stats?.snr !== undefined
                                                        ? `${snrValue.toFixed(1)} dB`
                                                        : '0.0 dB'}
                                                </Typography>
                                            </Stack>
                                            <LinearProgress
                                                variant="determinate"
                                                value={Math.min(100, Math.max(0, (snrValue / 24) * 100))}
                                                color={getSnrColor(snrValue)}
                                                sx={{ height: 5, borderRadius: 2 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Signal Level
                                                </Typography>
                                                <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                    {signalStrength}%
                                                </Typography>
                                            </Stack>
                                            <LinearProgress
                                                variant="determinate"
                                                value={Math.min(100, Math.max(0, signalStrength))}
                                                color="info"
                                                sx={{ height: 5, borderRadius: 2 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Scanline ({currentLine}/{totalLines})
                                                </Typography>
                                                <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                    {Math.round(progressPct)}%
                                                </Typography>
                                            </Stack>
                                            <LinearProgress
                                                variant="determinate"
                                                value={Math.min(100, Math.max(0, progressPct))}
                                                color="success"
                                                sx={{ height: 5, borderRadius: 2 }}
                                            />
                                        </Box>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        </div>
                    </StyledIslandParentScrollbar>

                    {/* ISLAND 3: Bottom Audio & Spectrogram Insights Island (matches DecodedInsightsIsland) */}
                    <StyledIslandParentScrollbar key="sstv-insights">
                        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <TitleBar
                                className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                    Audio Analysis
                                </Typography>
                            </TitleBar>

                            <AntTabs
                                value={activeBottomTab}
                                onChange={(_, val) => setActiveBottomTab(val)}
                                variant="standard"
                                sx={{
                                    px: 1,
                                    minHeight: 30,
                                    '& .MuiTabs-flexContainer': {
                                        justifyContent: 'flex-start',
                                        alignItems: 'center',
                                        gap: 0.5,
                                    },
                                    '& .MuiTabs-indicator': {
                                        height: 2,
                                    },
                                }}
                            >
                                <AntTab
                                    value="waveform"
                                    label="Waveform & Spectrum"
                                    sx={{
                                        '&.MuiTab-root': { fontSize: '0.68rem !important' },
                                        minHeight: 30,
                                        height: 30,
                                        minWidth: 0,
                                        px: 1.25,
                                        py: 0.25,
                                    }}
                                />
                                <AntTab
                                    value="spectrogram"
                                    label="Spectrogram Waterfall"
                                    sx={{
                                        '&.MuiTab-root': { fontSize: '0.68rem !important' },
                                        minHeight: 30,
                                        height: 30,
                                        minWidth: 0,
                                        px: 1.25,
                                        py: 0.25,
                                    }}
                                />
                            </AntTabs>

                            <Box
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    display: 'grid',
                                    gridTemplateColumns:
                                        activeBottomTab === 'waveform'
                                            ? { xs: '1fr', md: '1fr 1fr' }
                                            : '1fr',
                                    backgroundColor: '#0d1117',
                                    overflow: 'hidden',
                                }}
                            >
                                <Box
                                    sx={{
                                        display: activeBottomTab === 'waveform' ? 'block' : 'none',
                                        height: '100%',
                                        borderRight: `1px solid ${theme.palette.border.main}`,
                                    }}
                                >
                                    <canvas
                                        ref={waveformCanvasRef}
                                        width={640}
                                        height={120}
                                        style={{ width: '100%', height: '100%', display: 'block' }}
                                    />
                                </Box>

                                <Box
                                    sx={{
                                        display: activeBottomTab === 'waveform' ? 'block' : 'none',
                                        height: '100%',
                                    }}
                                >
                                    <canvas
                                        ref={spectrumCanvasRef}
                                        width={640}
                                        height={120}
                                        style={{ width: '100%', height: '100%', display: 'block' }}
                                    />
                                </Box>

                                <Box
                                    sx={{
                                        display: activeBottomTab === 'spectrogram' ? 'block' : 'none',
                                        height: '100%',
                                    }}
                                >
                                    <canvas
                                        ref={spectrogramCanvasRef}
                                        width={960}
                                        height={140}
                                        style={{ width: '100%', height: '100%', display: 'block' }}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </StyledIslandParentScrollbar>
                </Responsive>
            ) : null}
        </div>
    );
}
