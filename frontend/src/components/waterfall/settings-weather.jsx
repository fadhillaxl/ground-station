import React, { useState } from 'react';
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
} from "@mui/material";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useSocket } from "../common/socket.jsx";
import { useNavigate } from 'react-router-dom';
import { toast } from "../../utils/toast-with-timestamp.jsx";

const WeatherAccordion = ({
                              expanded,
                              onAccordionChange,
                              selectedSDRId,
                              isStreaming,
                          }) => {
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [pipelineId, setPipelineId] = useState('gk2a_lrit');
    const [starting, setStarting] = useState(false);

    const handleStartLiveDecode = async () => {
        if (!selectedSDRId || selectedSDRId === 'none') {
            toast.error('Please select an active SDR device first.');
            return;
        }

        setStarting(true);
        try {
            // 1. Stop streaming waterfall if it is currently active
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

            // 2. Trigger instant weather decode
            if (socket) {
                socket.emit("api.call", {
                    cmd: 'trigger-instant-weather-decode',
                    data: {
                        pipeline_id: pipelineId,
                        sdr_id: selectedSDRId
                    }
                }, (response) => {
                    setStarting(false);
                    if (response?.success && response?.observation_id) {
                        toast.success('Live SatDump Weather Decoder started successfully!');
                        // Redirect to the weather page with the new observation ID
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
                        Start a live weather satellite decoding session (SatDump) using the currently selected SDR hardware device.
                    </Typography>

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
