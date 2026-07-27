import React, { useState, useMemo, useEffect } from 'react';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Button,
    CircularProgress,
    TextField,
    FormControlLabel,
    Switch,
    Paper,
    Slider,
    Grid,
} from "@mui/material";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useSocket } from "../common/socket.jsx";
import { useNavigate } from 'react-router-dom';
import { toast } from "../../utils/toast-with-timestamp.jsx";

const PIPELINE_PRESETS = {
    gk2a_lrit: {
        name: 'GEO-KOMPSAT-2A LRIT (BPSK)',
        frequency_mhz: 1692.14,
        sample_rate_msps: 2.048,
        gain: 49,
        lna_agc: true,
        bias_t: true,
    },
    gk2a_hrit: {
        name: 'GEO-KOMPSAT-2A HRIT (QPSK)',
        frequency_mhz: 1695.40,
        sample_rate_msps: 6.000,
        gain: 49,
        lna_agc: true,
        bias_t: true,
    },
};

const WeatherAccordion = ({
                              expanded,
                              onAccordionChange,
                              selectedSDRId,
                              sdrs = [],
                              isStreaming,
                          }) => {
    const { socket } = useSocket();
    const navigate = useNavigate();
    
    const [pipelineId, setPipelineId] = useState('gk2a_lrit');
    const [frequencyMHz, setFrequencyMHz] = useState(1692.14);
    const [sampleRateMSPS, setSampleRateMSPS] = useState(2.048);
    const [gain, setGain] = useState(49);
    const [lnaAgc, setLnaAgc] = useState(true);
    const [biasT, setBiasT] = useState(true);
    const [starting, setStarting] = useState(false);

    // Update form values when pipeline changes
    useEffect(() => {
        const preset = PIPELINE_PRESETS[pipelineId];
        if (preset) {
            setFrequencyMHz(preset.frequency_mhz);
            setSampleRateMSPS(preset.sample_rate_msps);
            setGain(preset.gain);
            setLnaAgc(preset.lna_agc);
            setBiasT(preset.bias_t);
        }
    }, [pipelineId]);

    // Retrieve active SDR device details
    const activeSDR = useMemo(() => {
        if (!selectedSDRId || selectedSDRId === 'none') return null;
        return sdrs.find((sdr) => String(sdr.id) === String(selectedSDRId)) || null;
    }, [selectedSDRId, sdrs]);

    // Build CLI Command Preview
    const commandPreview = useMemo(() => {
        const pipelineArg = pipelineId;
        const outDirArg = `./output_${pipelineId}`;
        const freqHzStr = String(Math.round(parseFloat(frequencyMHz) * 1e6));
        const rateHzStr = String(Math.round(parseFloat(sampleRateMSPS) * 1e6));
        
        let srcArgs = '--source rtlsdr';
        if (activeSDR) {
            const sdrType = String(activeSDR.type || '').toLowerCase();
            if (sdrType.includes('tcp') || activeSDR.connection_type === 'tcp' || activeSDR.host) {
                const host = activeSDR.host || '192.168.99.218';
                const port = activeSDR.port || 1234;
                srcArgs = `--source rtltcp --ip_address ${host} --port ${port}`;
            } else if (sdrType.includes('airspy')) {
                srcArgs = '--source airspy';
            }
        } else {
            srcArgs = '--source rtltcp --ip_address 192.168.99.218 --port 1234';
        }

        const gainStr = `--gain ${gain}`;
        const agcStr = lnaAgc ? ' --lna_agc' : '';
        const biasStr = biasT ? ' --bias' : '';

        return `satdump live ${pipelineArg} ${outDirArg} ${srcArgs} --frequency ${freqHzStr} --samplerate ${rateHzStr} ${gainStr}${agcStr}${biasStr}`;
    }, [pipelineId, frequencyMHz, sampleRateMSPS, gain, lnaAgc, biasT, activeSDR]);

    const handleStartLiveDecode = async () => {
        if (!selectedSDRId || selectedSDRId === 'none') {
            toast.error('Please select an active SDR device first.');
            return;
        }

        setStarting(true);
        try {
            // 1. Stop streaming waterfall if active
            if (isStreaming && socket) {
                await new Promise((resolve) => {
                    socket.emit("api.call", {
                        cmd: 'sdr.stop-streaming',
                        data: null
                    }, () => {
                        resolve();
                    });
                });
            }

            // 2. Convert MHz & MSPS to Hz
            const freqHz = parseFloat(frequencyMHz) * 1e6;
            const sampleRateHz = parseFloat(sampleRateMSPS) * 1e6;

            // 3. Trigger instant weather decode with custom CLI parameters
            if (socket) {
                socket.emit("api.call", {
                    cmd: 'trigger-instant-weather-decode',
                    data: {
                        pipeline_id: pipelineId,
                        sdr_id: selectedSDRId,
                        frequency_hz: freqHz,
                        sample_rate: sampleRateHz,
                        gain: parseFloat(gain),
                        lna_agc: lnaAgc,
                        bias: biasT,
                        bias_t: biasT
                    }
                }, (response) => {
                    setStarting(false);
                    if (response?.success && response?.observation_id) {
                        toast.success('Live SatDump Weather Decoder started successfully!');
                        navigate(`/weather/${response.observation_id}`);
                    } else {
                        toast.error(response?.error || 'Failed to start Live SatDump Decoder.');
                    }
                });
            } else {
                setStarting(false);
                toast.error('Socket not connected.');
            }
        } catch (error) {
            setStarting(false);
            toast.error(`Error starting decoder: ${error.message}`);
        }
    };

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="panel-weather-content" id="panel-weather-header">
                <Typography component="span">Live Weather SatDecoder</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{
                backgroundColor: 'background.elevated',
                p: 2,
            }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        Configure SatDump CLI live decoding parameters for satellite reception.
                    </Typography>

                    {/* Satellite Pipeline Selector */}
                    <FormControl fullWidth variant="outlined" size="small">
                        <InputLabel>Weather Pipeline</InputLabel>
                        <Select
                            value={pipelineId}
                            onChange={(e) => setPipelineId(e.target.value)}
                            label="Weather Pipeline"
                        >
                            <MenuItem value="gk2a_lrit">GEO-KOMPSAT-2A LRIT (BPSK)</MenuItem>
                            <MenuItem value="gk2a_hrit">GEO-KOMPSAT-2A HRIT (QPSK)</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Frequency & Sample Rate Inputs */}
                    <Grid container spacing={1.5}>
                        <Grid item xs={6}>
                            <TextField
                                label="Frequency (MHz)"
                                type="number"
                                size="small"
                                fullWidth
                                value={frequencyMHz}
                                onChange={(e) => setFrequencyMHz(e.target.value)}
                                inputProps={{ step: "0.01" }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Sample Rate (MSPS)"
                                type="number"
                                size="small"
                                fullWidth
                                value={sampleRateMSPS}
                                onChange={(e) => setSampleRateMSPS(e.target.value)}
                                inputProps={{ step: "0.001" }}
                            />
                        </Grid>
                    </Grid>

                    {/* Gain Control */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">Gain (dB)</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                                {gain} dB
                            </Typography>
                        </Box>
                        <Slider
                            value={gain}
                            min={0}
                            max={50}
                            step={1}
                            size="small"
                            onChange={(e, val) => setGain(val)}
                        />
                    </Box>

                    {/* LNA AGC & Bias-T Switches */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={lnaAgc}
                                    onChange={(e) => setLnaAgc(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label={<Typography variant="caption">LNA AGC (--lna_agc)</Typography>}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={biasT}
                                    onChange={(e) => setBiasT(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label={<Typography variant="caption">Bias-T (--bias)</Typography>}
                        />
                    </Box>

                    {/* Real-Time SatDump Command Preview */}
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 1.5,
                            backgroundColor: 'background.paper',
                            borderColor: 'divider',
                            borderRadius: 1,
                        }}
                    >
                        <Typography variant="caption" color="primary" sx={{ display: 'flex', alignItems: 'center', mb: 0.5, fontWeight: 'bold' }}>
                            <TerminalIcon fontSize="inherit" sx={{ mr: 0.5 }} /> SatDump Command Preview
                        </Typography>
                        <Typography
                            variant="caption"
                            component="pre"
                            sx={{
                                margin: 0,
                                fontFamily: 'monospace',
                                fontSize: '0.70rem',
                                color: 'text.primary',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                backgroundColor: 'action.hover',
                                p: 1,
                                borderRadius: 0.5,
                            }}
                        >
                            {commandPreview}
                        </Typography>
                    </Paper>

                    {/* Start Decode Button */}
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={starting ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                        onClick={handleStartLiveDecode}
                        disabled={starting || !selectedSDRId || selectedSDRId === 'none'}
                        fullWidth
                    >
                        {starting ? 'Starting SatDump...' : 'Mulai Live Decode'}
                    </Button>
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default React.memo(WeatherAccordion);
