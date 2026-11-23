import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Box,
    Paper,
    Typography,
    Stack,
    Chip,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    IconButton,
    Divider,
    InputAdornment,
    Grid,
} from '@mui/material';
import RouterIcon from '@mui/icons-material/Router';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import SearchIcon from '@mui/icons-material/Search';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import TerminalIcon from '@mui/icons-material/Terminal';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { absoluteStrategy } from 'react-grid-layout/core';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import {
    StyledIslandParentNoScrollbar,
    TitleBar,
    islandTitleBarSx,
    getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import { useSocket } from '../common/socket.jsx';
import {
    fetchDirewolfStatus,
    fetchDirewolfPackets,
    clearDirewolfPackets,
    simulateDirewolfPresets,
    updateDirewolfServerConfig,
    receiveLivePacket,
    receiveDirewolfStatus,
    receivePacketsCleared,
    setSelectedPacketId,
    setChannelFilter,
    setSearchQuery,
    setViewMode,
    setGridEditable,
} from './packets-slice.jsx';

export const gridLayoutStoreName = 'direwolf-packets-layouts';
const LAYOUT_SCHEMA_VERSION = 1;
const SHARED_RESIZE_HANDLES = ['s', 'sw', 'w', 'se', 'nw', 'ne', 'e'];

const defaultLayouts = {
    lg: [
        { i: 'packet-summary', x: 0, y: 0, w: 48, h: 12, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-feed', x: 0, y: 12, w: 29, h: 48, minH: 20, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-inspector', x: 29, y: 12, w: 19, h: 48, minH: 20, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    ],
    md: [
        { i: 'packet-summary', x: 0, y: 0, w: 40, h: 13, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-feed', x: 0, y: 13, w: 24, h: 48, minH: 20, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-inspector', x: 24, y: 13, w: 16, h: 48, minH: 20, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    ],
    sm: [
        { i: 'packet-summary', x: 0, y: 0, w: 24, h: 18, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-feed', x: 0, y: 18, w: 24, h: 38, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-inspector', x: 0, y: 56, w: 24, h: 40, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    ],
    xs: [
        { i: 'packet-summary', x: 0, y: 0, w: 8, h: 24, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-feed', x: 0, y: 24, w: 8, h: 38, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-inspector', x: 0, y: 62, w: 8, h: 42, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
    ],
    xxs: [
        { i: 'packet-summary', x: 0, y: 0, w: 8, h: 26, minH: 10, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-feed', x: 0, y: 26, w: 8, h: 38, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
        { i: 'packet-inspector', x: 0, y: 64, w: 8, h: 44, minH: 18, moved: false, static: false, resizeHandles: [...SHARED_RESIZE_HANDLES] },
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

function getPresetChipColor(preset) {
    const p = String(preset || '').toUpperCase();
    if (p.includes('LAPAN') || p.includes('IO-86')) return 'success';
    if (p.includes('ISS') || p.includes('ARISS')) return 'info';
    if (p.includes('CUBESAT')) return 'warning';
    return 'default';
}

function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export default function PacketTelemetryPage() {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

    const {
        status,
        packets,
        selectedPacketId,
        channelFilter,
        searchQuery,
        viewMode,
        gridEditable,
        simulating,
    } = useSelector((state) => state.packets || {});

    const isEditing = useSelector((state) =>
        Boolean(state.dashboard?.isEditing || gridEditable)
    );

    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return normalizeLayoutsResizeHandles(loaded ?? defaultLayouts);
    });

    // Fetch initial status and packet log on mount, plus periodic status poll
    useEffect(() => {
        dispatch(fetchDirewolfStatus({ probe: true }));
        dispatch(fetchDirewolfPackets({ limit: 200 }));

        const timer = setInterval(() => {
            dispatch(fetchDirewolfStatus({ probe: true }));
        }, 10000);
        return () => clearInterval(timer);
    }, [dispatch]);

    // Subscribe to real-time Socket.IO events from backend Direwolf bridge
    useEffect(() => {
        if (!socket) return undefined;

        const handlePacket = (packet) => {
            dispatch(receiveLivePacket(packet));
        };
        const handleStatus = (nextStatus) => {
            dispatch(receiveDirewolfStatus(nextStatus));
        };
        const handleCleared = () => {
            dispatch(receivePacketsCleared());
        };

        socket.on('direwolf-packet', handlePacket);
        socket.on('direwolf-status', handleStatus);
        socket.on('direwolf-cleared', handleCleared);

        return () => {
            socket.off('direwolf-packet', handlePacket);
            socket.off('direwolf-status', handleStatus);
            socket.off('direwolf-cleared', handleCleared);
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

    // Filter packets by channel (ALL, 0=1200bps, 1=9600bps) and search query
    const filteredPackets = useMemo(() => {
        const list = Array.isArray(packets) ? packets : [];
        return list.filter((pkt) => {
            if (channelFilter !== 'ALL' && String(pkt.channel) !== String(channelFilter)) {
                return false;
            }
            if (searchQuery && searchQuery.trim()) {
                const q = searchQuery.trim().toUpperCase();
                const src = String(pkt.sourceCallsign || '').toUpperCase();
                const dst = String(pkt.destinationCallsign || '').toUpperCase();
                const digis = Array.isArray(pkt.digipeaters)
                    ? pkt.digipeaters.join(',').toUpperCase()
                    : '';
                const preset = String(pkt.satellitePreset || '').toUpperCase();
                const ascii = String(pkt.payloadAscii || '').toUpperCase();
                const hex = String(pkt.payloadHex || '').toUpperCase();
                return (
                    src.includes(q) ||
                    dst.includes(q) ||
                    digis.includes(q) ||
                    preset.includes(q) ||
                    ascii.includes(q) ||
                    hex.includes(q)
                );
            }
            return true;
        });
    }, [packets, channelFilter, searchQuery]);

    const selectedPacket = useMemo(() => {
        if (!filteredPackets.length) return null;
        return (
            filteredPackets.find((p) => p.id === selectedPacketId) ||
            packets.find((p) => p.id === selectedPacketId) ||
            filteredPackets[0]
        );
    }, [filteredPackets, packets, selectedPacketId]);

    const handleExportJson = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const content = JSON.stringify(filteredPackets, null, 2);
        downloadBlob(content, `direwolf-ax25-packets-${timestamp}.json`, 'application/json');
    };

    const handleExportCsv = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const headers = [
            'timestamp',
            'channel',
            'baudRate',
            'satellitePreset',
            'sourceCallsign',
            'destinationCallsign',
            'digipeaters',
            'controlField',
            'pid',
            'payloadAscii',
            'payloadHex',
        ];
        const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
        const rows = filteredPackets.map((p) =>
            [
                p.timestamp,
                p.channel,
                p.baudRate,
                p.satellitePreset,
                p.sourceCallsign,
                p.destinationCallsign,
                Array.isArray(p.digipeaters) ? p.digipeaters.join(' ') : '',
                p.controlField,
                p.pid,
                p.payloadAscii,
                p.payloadHex,
            ]
                .map(escapeCsv)
                .join(',')
        );
        const csvContent = [headers.join(','), ...rows].join('\n');
        downloadBlob(csvContent, `direwolf-ax25-packets-${timestamp}.csv`, 'text/csv;charset=utf-8;');
    };

    const kissConnected = Boolean(status?.kiss?.connected);
    const kissHost = status?.kiss?.host || 'host.docker.internal';
    const kissPort = status?.kiss?.port || 8001;

    const rigConnected = Boolean(status?.rigctld?.connected);
    const rigHost = status?.rigctld?.host || 'host.docker.internal';
    const rigPort = status?.rigctld?.port || 4532;
    const rigLatency = status?.rigctld?.latencyMs;
    const rigComPort = status?.serverAudio?.rigctldComPort || status?.rigctld?.comPort || 'COM3';
    const audioComPort = status?.serverAudio?.audioComPort || 'COM4';

    const totalPackets = status?.stats?.totalPackets ?? packets.length;
    const ch0Count = status?.stats?.channel0Packets1200 ?? packets.filter((p) => p.channel === 0).length;
    const ch1Count = status?.stats?.channel1Packets9600 ?? packets.filter((p) => p.channel === 1).length;

    const copyText = (txt) => {
        if (txt && navigator.clipboard) {
            navigator.clipboard.writeText(txt);
        }
    };

    return (
        <Box sx={{ width: '100%', height: '100%', p: 1.5, boxSizing: 'border-box' }}>
            {/* Top Status & Control Bar */}
            <Paper
                elevation={0}
                sx={{
                    p: 1.5,
                    mb: 1.5,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'border.main',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                }}
            >
                {/* Brand & Dual Connection Badges (KISS:8001 + External rigctld:4532) */}
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    <RouterIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                    <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                                Packet & Telemetry (Direwolf AX.25 / KISS)
                            </Typography>

                            <Tooltip
                                title={`Direwolf KISS TCP Socket (${kissHost}:${kissPort}) • AGWPE (${status?.kiss?.agwpePort || 8000})`}
                            >
                                <Chip
                                    icon={<TerminalIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    label={
                                        kissConnected
                                            ? `KISS :${kissPort} CONNECTED`
                                            : `KISS :${kissPort} STANDBY`
                                    }
                                    size="small"
                                    color={kissConnected ? 'success' : 'warning'}
                                    variant="outlined"
                                    sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700 }}
                                />
                            </Tooltip>

                            <Tooltip
                                title={`External Manual rigctld (${rigHost}:${rigPort}) • Icom IC-9700 (Hamlib Model 3081) • Read-Only TCP Health Check`}
                            >
                                <Chip
                                    icon={<SettingsInputAntennaIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    label={
                                        rigConnected
                                            ? `rigctld :${rigPort} ONLINE (IC-9700${rigLatency != null ? ` • ${rigLatency}ms` : ''})`
                                            : `rigctld :${rigPort} OFFLINE`
                                    }
                                    size="small"
                                    color={rigConnected ? 'success' : 'default'}
                                    variant="outlined"
                                    sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700 }}
                                />
                            </Tooltip>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            Server Icom IC-9700 ({rigComPort} rigctld → :{rigPort} • {audioComPort} USB Audio CODEC 48000 Hz) • Ch 0: 1200 bps • Ch 1: 9600 bps
                        </Typography>
                    </Box>
                </Stack>

                {/* Controls: Server COM Ports (COM3 / COM4), Channel Filter, ASCII/HEX Toggle, Simulate, Clear, Export */}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <FormControl size="small" sx={{ minWidth: 125 }}>
                        <InputLabel id="direwolf-rig-com-label">rigctld (Server)</InputLabel>
                        <Select
                            labelId="direwolf-rig-com-label"
                            value={rigComPort}
                            label="rigctld (Server)"
                            onChange={(e) =>
                                dispatch(
                                    updateDirewolfServerConfig({
                                        rigctldComPort: e.target.value,
                                        audioComPort,
                                    })
                                )
                            }
                        >
                            <MenuItem value="COM3">COM3 (CAT :4532)</MenuItem>
                            <MenuItem value="COM4">COM4 (CAT :4532)</MenuItem>
                            <MenuItem value="/dev/ttyUSB0">/dev/ttyUSB0</MenuItem>
                            <MenuItem value="/dev/ttyUSB1">/dev/ttyUSB1</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 125 }}>
                        <InputLabel id="direwolf-audio-com-label">Audio (Server)</InputLabel>
                        <Select
                            labelId="direwolf-audio-com-label"
                            value={audioComPort}
                            label="Audio (Server)"
                            onChange={(e) =>
                                dispatch(
                                    updateDirewolfServerConfig({
                                        rigctldComPort: rigComPort,
                                        audioComPort: e.target.value,
                                    })
                                )
                            }
                        >
                            <MenuItem value="COM4">COM4 (USB Audio)</MenuItem>
                            <MenuItem value="COM3">COM3 (USB Audio)</MenuItem>
                            <MenuItem value="plughw:CARD=CODEC,DEV=0">ALSA CODEC</MenuItem>
                            <MenuItem value="/dev/ttyUSB1">/dev/ttyUSB1</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 165 }}>
                        <InputLabel id="direwolf-channel-filter-label">Demod Channel</InputLabel>
                        <Select
                            labelId="direwolf-channel-filter-label"
                            value={channelFilter}
                            label="Demod Channel"
                            onChange={(e) => dispatch(setChannelFilter(e.target.value))}
                        >
                            <MenuItem value="ALL">All Channels (1200 + 9600)</MenuItem>
                            <MenuItem value="0">Ch 0 • 1200 bps (AFSK)</MenuItem>
                            <MenuItem value="1">Ch 1 • 9600 bps (FSK/GFSK)</MenuItem>
                        </Select>
                    </FormControl>

                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={viewMode}
                        onChange={(_, val) => {
                            if (val) dispatch(setViewMode(val));
                        }}
                        aria-label="Payload display mode"
                    >
                        <ToggleButton value="ASCII" sx={{ px: 1.5, fontSize: '0.75rem', fontWeight: 700 }}>
                            ASCII
                        </ToggleButton>
                        <ToggleButton value="HEX" sx={{ px: 1.5, fontSize: '0.75rem', fontWeight: 700 }}>
                            Hex Dump
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Tooltip title="Inject 3 realistic satellite packets (LAPAN-A2/IO-86, ISS, CubeSat 9600 bps Binary)">
                        <Button
                            variant="outlined"
                            color="info"
                            size="small"
                            startIcon={<ScienceIcon />}
                            disabled={simulating}
                            onClick={() => dispatch(simulateDirewolfPresets())}
                            sx={{ height: 34, textTransform: 'none', fontWeight: 600 }}
                        >
                            Simulate Sat Pass
                        </Button>
                    </Tooltip>

                    <Button
                        variant="outlined"
                        color="warning"
                        size="small"
                        startIcon={<DeleteSweepIcon />}
                        onClick={() => dispatch(clearDirewolfPackets())}
                        disabled={packets.length === 0}
                        sx={{ height: 34, textTransform: 'none', fontWeight: 600 }}
                    >
                        Clear Logs
                    </Button>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FileDownloadIcon />}
                        onClick={handleExportJson}
                        disabled={filteredPackets.length === 0}
                        sx={{ height: 34, textTransform: 'none', fontWeight: 600 }}
                    >
                        Export JSON
                    </Button>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FileDownloadIcon />}
                        onClick={handleExportCsv}
                        disabled={filteredPackets.length === 0}
                        sx={{ height: 34, textTransform: 'none', fontWeight: 600 }}
                    >
                        Export CSV
                    </Button>

                    <Tooltip title="Refresh connection & packet status">
                        <IconButton
                            size="small"
                            onClick={() => {
                                dispatch(fetchDirewolfStatus({ probe: true }));
                                dispatch(fetchDirewolfPackets({ limit: 200 }));
                            }}
                        >
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={isEditing ? 'Lock Grid Layout' : 'Edit Grid Layout'}>
                        <IconButton
                            size="small"
                            onClick={() => dispatch(setGridEditable(!gridEditable))}
                        >
                            {isEditing ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Reset Layout">
                        <IconButton size="small" onClick={handleResetLayout}>
                            <RestartAltIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Paper>

            {/* Responsive Dashboard Grid */}
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
                        {/* 1. Summary KPI Strip Island */}
                        <StyledIslandParentNoScrollbar key="packet-summary">
                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <TitleBar
                                    className={getClassNamesBasedOnGridEditing(isEditing, [])}
                                    sx={{
                                        ...islandTitleBarSx,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        pr: 1,
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={700}>
                                        Demodulator Channels & Transceiver Telemetry Summary
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Audio Device: plughw:CARD=CODEC,DEV=0 (48 kHz)
                                    </Typography>
                                </TitleBar>

                                <Box sx={{ p: 1, flex: 1, display: 'flex', alignItems: 'center' }}>
                                    <Grid container spacing={1.5} sx={{ width: '100%' }}>
                                        <Grid size={{ xs: 6, md: 3 }}>
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                    TOTAL AX.25 FRAMES
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                                    <Typography variant="h6" fontWeight={800} fontFamily="monospace">
                                                        {totalPackets}
                                                    </Typography>
                                                    <Chip
                                                        label={`${filteredPackets.length} shown`}
                                                        size="small"
                                                        sx={{ height: 18, fontSize: '0.65rem' }}
                                                    />
                                                </Stack>
                                            </Paper>
                                        </Grid>

                                        <Grid size={{ xs: 6, md: 3 }}>
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Typography variant="caption" color="info.main" fontWeight={700}>
                                                    CHANNEL 0 • 1200 BPS AFSK
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                                    <Typography variant="h6" fontWeight={800} fontFamily="monospace" color="info.main">
                                                        {ch0Count}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        APRS / ISS / IO-86
                                                    </Typography>
                                                </Stack>
                                            </Paper>
                                        </Grid>

                                        <Grid size={{ xs: 6, md: 3 }}>
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Typography variant="caption" color="warning.main" fontWeight={700}>
                                                    CHANNEL 1 • 9600 BPS FSK/GFSK
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                                    <Typography variant="h6" fontWeight={800} fontFamily="monospace" color="warning.main">
                                                        {ch1Count}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        G3RUH CubeSat Beacon
                                                    </Typography>
                                                </Stack>
                                            </Paper>
                                        </Grid>

                                        <Grid size={{ xs: 6, md: 3 }}>
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                                    ICOM IC-9700 PTT BRIDGE
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight={700}
                                                        fontFamily="monospace"
                                                        color={rigConnected ? 'success.main' : 'text.secondary'}
                                                    >
                                                        {rigConnected ? 'RIG 2 :4532 READY' : 'RIG 2 :4532 STANDBY'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Model 3081 (RO)
                                                    </Typography>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    </Grid>
                                </Box>
                            </Box>
                        </StyledIslandParentNoScrollbar>

                        {/* 2. Live Telemetry & Packet Feed Island */}
                        <StyledIslandParentNoScrollbar key="packet-feed">
                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <TitleBar
                                    className={getClassNamesBasedOnGridEditing(isEditing, [])}
                                    sx={{
                                        ...islandTitleBarSx,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        pr: 1,
                                    }}
                                >
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <TerminalIcon fontSize="small" sx={{ color: 'primary.main' }} />
                                        <Typography variant="body2" fontWeight={700}>
                                            Live Telemetry & AX.25 Packet Feed
                                        </Typography>
                                        <Chip
                                            label={`${filteredPackets.length} Packets`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                        />
                                    </Stack>

                                    <TextField
                                        placeholder="Search callsign, digi, payload..."
                                        size="small"
                                        value={searchQuery}
                                        onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SearchIcon sx={{ fontSize: 15 }} />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={{
                                            width: 220,
                                            '& .MuiInputBase-input': { py: 0.3, px: 0.5, fontSize: '0.75rem' },
                                        }}
                                    />
                                </TitleBar>

                                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                    {filteredPackets.length === 0 ? (
                                        <Box
                                            display="flex"
                                            flexDirection="column"
                                            alignItems="center"
                                            justifyContent="center"
                                            height="100%"
                                            p={3}
                                        >
                                            <Typography variant="body2" color="text.secondary" textAlign="center" gutterBottom>
                                                No AX.25 packets in feed matching current filter.
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mb: 1.5 }}>
                                                Listening on Direwolf KISS TCP ({kissHost}:{kissPort}) • Click &quot;Simulate Sat Pass&quot; or run scripts/test-direwolf-sat-sim.js to inject test frames.
                                            </Typography>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<ScienceIcon />}
                                                onClick={() => dispatch(simulateDirewolfPresets())}
                                                disabled={simulating}
                                            >
                                                Inject 3 Realistic Satellite Packets
                                            </Button>
                                        </Box>
                                    ) : (
                                        <TableContainer sx={{ height: '100%' }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, width: 90 }}>
                                                            Time
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, width: 100 }}>
                                                            Channel
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, width: 130 }}>
                                                            Preset
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, width: 185 }}>
                                                            AX.25 Route
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                                            Payload ({viewMode === 'HEX' ? 'Hex Dump' : 'ASCII'})
                                                        </TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {filteredPackets.map((pkt) => {
                                                        const isSelected = selectedPacket?.id === pkt.id;
                                                        const timeLabel = pkt.timestamp
                                                            ? new Date(pkt.timestamp).toLocaleTimeString()
                                                            : '-';
                                                        const digiStr =
                                                            Array.isArray(pkt.digipeaters) && pkt.digipeaters.length > 0
                                                                ? `via ${pkt.digipeaters.join(', ')}`
                                                                : 'Direct';

                                                        return (
                                                            <TableRow
                                                                key={pkt.id}
                                                                hover
                                                                selected={isSelected}
                                                                onClick={() => dispatch(setSelectedPacketId(pkt.id))}
                                                                sx={{ cursor: 'pointer' }}
                                                            >
                                                                <TableCell
                                                                    sx={{
                                                                        fontSize: '0.72rem',
                                                                        fontFamily: 'monospace',
                                                                        color: 'text.secondary',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {timeLabel}
                                                                </TableCell>
                                                                <TableCell sx={{ py: 0.5 }}>
                                                                    <Chip
                                                                        label={`CH${pkt.channel} • ${pkt.baudRate || (pkt.channel === 1 ? 9600 : 1200)}`}
                                                                        size="small"
                                                                        color={pkt.channel === 1 ? 'warning' : 'info'}
                                                                        variant="outlined"
                                                                        sx={{
                                                                            height: 19,
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: 700,
                                                                            fontFamily: 'monospace',
                                                                        }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell sx={{ py: 0.5 }}>
                                                                    <Chip
                                                                        label={pkt.satellitePreset || 'AX.25'}
                                                                        size="small"
                                                                        color={getPresetChipColor(pkt.satellitePreset)}
                                                                        sx={{
                                                                            height: 19,
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: 700,
                                                                        }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell
                                                                    sx={{
                                                                        fontSize: '0.74rem',
                                                                        fontFamily: 'monospace',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    <Box component="span" fontWeight={700} color="primary.main">
                                                                        {pkt.sourceCallsign}
                                                                    </Box>
                                                                    {' → '}
                                                                    <Box component="span" fontWeight={700}>
                                                                        {pkt.destinationCallsign}
                                                                    </Box>
                                                                    <Typography
                                                                        variant="caption"
                                                                        display="block"
                                                                        color="text.secondary"
                                                                        fontFamily="monospace"
                                                                        fontSize="0.66rem"
                                                                    >
                                                                        {digiStr}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell
                                                                    sx={{
                                                                        fontSize: '0.74rem',
                                                                        fontFamily: 'monospace',
                                                                        color:
                                                                            viewMode === 'HEX' || pkt.isBinary
                                                                                ? 'warning.light'
                                                                                : 'success.main',
                                                                        wordBreak: 'break-all',
                                                                    }}
                                                                >
                                                                    {viewMode === 'HEX' ? (
                                                                        pkt.payloadHex || '-'
                                                                    ) : (
                                                                        <Stack direction="row" spacing={0.75} alignItems="center">
                                                                            {pkt.isBinary && (
                                                                                <Chip
                                                                                    label="BIN"
                                                                                    size="small"
                                                                                    color="warning"
                                                                                    variant="outlined"
                                                                                    sx={{
                                                                                        height: 16,
                                                                                        fontSize: '0.6rem',
                                                                                        fontWeight: 700,
                                                                                    }}
                                                                                />
                                                                            )}
                                                                            <span>{pkt.payloadAscii || '-'}</span>
                                                                        </Stack>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </Box>
                            </Box>
                        </StyledIslandParentNoScrollbar>

                        {/* 3. Packet Inspector Drawer / Card Island */}
                        <StyledIslandParentNoScrollbar key="packet-inspector">
                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <TitleBar
                                    className={getClassNamesBasedOnGridEditing(isEditing, [])}
                                    sx={{
                                        ...islandTitleBarSx,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        pr: 1,
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={700}>
                                        AX.25 Packet Inspector
                                    </Typography>
                                    {selectedPacket && (
                                        <Chip
                                            label={`${selectedPacket.payloadLength ?? 0} B payload`}
                                            size="small"
                                            variant="outlined"
                                            sx={{ height: 19, fontSize: '0.66rem', fontFamily: 'monospace' }}
                                        />
                                    )}
                                </TitleBar>

                                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
                                    {!selectedPacket ? (
                                        <Box
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            height="100%"
                                        >
                                            <Typography variant="body2" color="text.secondary" textAlign="center">
                                                Select an AX.25 packet row on the left to inspect its header, digipeater path, and hex/binary payload.
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Stack spacing={1.5}>
                                            {/* Header Summary */}
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1.25, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Stack
                                                    direction="row"
                                                    justifyContent="space-between"
                                                    alignItems="center"
                                                    sx={{ mb: 1 }}
                                                >
                                                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                                                        AX.25 FRAME HEADER
                                                    </Typography>
                                                    <Chip
                                                        label={selectedPacket.satellitePreset || 'Generic AX.25'}
                                                        size="small"
                                                        color={getPresetChipColor(selectedPacket.satellitePreset)}
                                                        sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
                                                    />
                                                </Stack>

                                                <Grid container spacing={1}>
                                                    <Grid size={{ xs: 6 }}>
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Source Callsign
                                                        </Typography>
                                                        <Typography variant="body2" fontFamily="monospace" fontWeight={700} color="primary.main">
                                                            {selectedPacket.sourceCallsign}
                                                        </Typography>
                                                    </Grid>
                                                    <Grid size={{ xs: 6 }}>
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Destination Callsign
                                                        </Typography>
                                                        <Typography variant="body2" fontFamily="monospace" fontWeight={700}>
                                                            {selectedPacket.destinationCallsign}
                                                        </Typography>
                                                    </Grid>
                                                    <Grid size={{ xs: 4 }}>
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Channel / Rate
                                                        </Typography>
                                                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                            CH{selectedPacket.channel} ({selectedPacket.baudRate} bps)
                                                        </Typography>
                                                    </Grid>
                                                    <Grid size={{ xs: 4 }}>
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Control Field
                                                        </Typography>
                                                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                            {selectedPacket.controlField} (UI)
                                                        </Typography>
                                                    </Grid>
                                                    <Grid size={{ xs: 4 }}>
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Protocol ID (PID)
                                                        </Typography>
                                                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                                            {selectedPacket.pid}
                                                        </Typography>
                                                    </Grid>
                                                </Grid>
                                            </Paper>

                                            {/* Digipeater Routing Path */}
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1.25, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Typography
                                                    variant="caption"
                                                    fontWeight={700}
                                                    color="text.secondary"
                                                    display="block"
                                                    sx={{ mb: 0.75 }}
                                                >
                                                    DIGIPEATER PATH ({selectedPacket.digipeaters?.length || 0} HOPS)
                                                </Typography>

                                                <Stack
                                                    direction="row"
                                                    spacing={0.5}
                                                    alignItems="center"
                                                    flexWrap="wrap"
                                                    useFlexGap
                                                >
                                                    <Chip
                                                        label={`SRC: ${selectedPacket.sourceCallsign}`}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                        sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem' }}
                                                    />
                                                    {(selectedPacket.digipeaters || []).map((digi, idx) => (
                                                        <React.Fragment key={`${digi}-${idx}`}>
                                                            <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                            <Chip
                                                                label={`DIGI ${idx + 1}: ${digi}`}
                                                                size="small"
                                                                color="info"
                                                                variant="outlined"
                                                                sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem' }}
                                                            />
                                                        </React.Fragment>
                                                    ))}
                                                    <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    <Chip
                                                        label={`DST: ${selectedPacket.destinationCallsign}`}
                                                        size="small"
                                                        color="success"
                                                        variant="outlined"
                                                        sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem' }}
                                                    />
                                                </Stack>
                                            </Paper>

                                            {/* Decoded Satellite Telemetry / APRS Fields */}
                                            {selectedPacket.decodedTelemetry && (
                                                <Paper
                                                    variant="outlined"
                                                    sx={{ p: 1.25, bgcolor: 'background.default', borderRadius: 1 }}
                                                >
                                                    <Stack
                                                        direction="row"
                                                        justifyContent="space-between"
                                                        alignItems="center"
                                                        sx={{ mb: 0.75 }}
                                                    >
                                                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                                                            DECODED TELEMETRY ({selectedPacket.decodedTelemetry.format})
                                                        </Typography>
                                                    </Stack>

                                                    <Grid container spacing={1}>
                                                        {(selectedPacket.decodedTelemetry.metrics || []).map((m) => (
                                                            <Grid size={{ xs: 6 }} key={m.key}>
                                                                <Box
                                                                    sx={{
                                                                        p: 0.75,
                                                                        border: '1px solid',
                                                                        borderColor: 'divider',
                                                                        borderRadius: 1,
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        variant="caption"
                                                                        color="text.secondary"
                                                                        display="block"
                                                                        fontSize="0.66rem"
                                                                    >
                                                                        {m.label}
                                                                    </Typography>
                                                                    <Typography
                                                                        variant="body2"
                                                                        fontFamily="monospace"
                                                                        fontWeight={700}
                                                                        color="success.main"
                                                                        fontSize="0.78rem"
                                                                    >
                                                                        {m.value} {m.unit && m.unit !== 'state' ? m.unit : ''}
                                                                    </Typography>
                                                                </Box>
                                                            </Grid>
                                                        ))}
                                                    </Grid>
                                                </Paper>
                                            )}

                                            {/* Payload Hex + ASCII Canonical Dump */}
                                            <Paper
                                                variant="outlined"
                                                sx={{ p: 1.25, bgcolor: 'background.default', borderRadius: 1 }}
                                            >
                                                <Stack
                                                    direction="row"
                                                    justifyContent="space-between"
                                                    alignItems="center"
                                                    sx={{ mb: 0.75 }}
                                                >
                                                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                                                        PAYLOAD HEX & ASCII DUMP ({selectedPacket.payloadLength ?? 0} BYTES)
                                                    </Typography>
                                                    <Tooltip title="Copy Payload Hex">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => copyText(selectedPacket.payloadHex)}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>

                                                <Box
                                                    sx={{
                                                        p: 1,
                                                        bgcolor: 'rgba(0, 0, 0, 0.28)',
                                                        borderRadius: 1,
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.72rem',
                                                        overflowX: 'auto',
                                                    }}
                                                >
                                                    {(selectedPacket.hexDumpLines || []).map((row) => (
                                                        <Box
                                                            key={row.offset}
                                                            sx={{
                                                                display: 'flex',
                                                                gap: 1.5,
                                                                whiteSpace: 'pre',
                                                                lineHeight: 1.55,
                                                            }}
                                                        >
                                                            <Box component="span" sx={{ color: 'text.secondary' }}>
                                                                {row.offset}
                                                            </Box>
                                                            <Box component="span" sx={{ color: 'warning.light' }}>
                                                                {row.hex}
                                                            </Box>
                                                            <Box component="span" sx={{ color: 'success.light' }}>
                                                                |{row.ascii}|
                                                            </Box>
                                                        </Box>
                                                    ))}
                                                </Box>

                                                <Divider sx={{ my: 1 }} />

                                                <Stack
                                                    direction="row"
                                                    justifyContent="space-between"
                                                    alignItems="center"
                                                    sx={{ mb: 0.5 }}
                                                >
                                                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                                                        RAW AX.25 FRAME BYTES ({selectedPacket.rawBytes?.length || 0} BYTES)
                                                    </Typography>
                                                    <Tooltip title="Copy Raw AX.25 Frame Hex">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => copyText(selectedPacket.rawHex)}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                                <Typography
                                                    variant="caption"
                                                    display="block"
                                                    fontFamily="monospace"
                                                    sx={{
                                                        color: 'text.secondary',
                                                        wordBreak: 'break-all',
                                                        fontSize: '0.68rem',
                                                    }}
                                                >
                                                    {selectedPacket.rawHex}
                                                </Typography>
                                            </Paper>
                                        </Stack>
                                    )}
                                </Box>
                            </Box>
                        </StyledIslandParentNoScrollbar>
                    </Responsive>
                ) : null}
            </div>
        </Box>
    );
}
