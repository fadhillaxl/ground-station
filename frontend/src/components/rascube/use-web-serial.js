import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import {
  setConnectionState,
  receiveLiveTelemetry,
  receiveLiveCameraChunk,
  resetCameraState,
  addUplinkLog,
  updateRascubeStatus,
} from './rascube-slice.jsx';

export const USB_VID = 0x0483;
export const USB_PID = 0x5740;

export function useWebSerial() {
  const dispatch = useDispatch();
  const [isConnected, setIsConnected] = useState(false);
  const [portInfo, setPortInfo] = useState(null);
  const [error, setError] = useState(null);

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const keepReadingRef = useRef(false);

  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Disconnect handler
  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
    } catch {
      // Ignore cancellation error
    }

    try {
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch {
      // Ignore port closing error
    }

    portRef.current = null;
    readerRef.current = null;
    setIsConnected(false);
    setPortInfo(null);

    dispatch(
      setConnectionState({
        isConnected: false,
        connectedPort: null,
      })
    );
    dispatch(updateRascubeStatus({ isConnected: false, serialNumber: 1581 }));
  }, [dispatch]);

  // Send raw frame: [port, len, ...payload]
  const sendCommand = useCallback(
    async (portByte, payloadBytes = []) => {
      if (!portRef.current || !portRef.current.writable) {
        throw new Error('Web Serial is not connected.');
      }
      try {
        const frame = new Uint8Array(2 + payloadBytes.length);
        frame[0] = portByte;
        frame[1] = payloadBytes.length;
        if (payloadBytes.length > 0) {
          frame.set(payloadBytes, 2);
        }

        const writer = portRef.current.writable.getWriter();
        await writer.write(frame);
        writer.releaseLock();

        const hex = Array.from(frame)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();

        return hex;
      } catch (err) {
        throw new Error(`Failed to transmit frame: ${err.message}`);
      }
    },
    []
  );

  // Send target satellite filter
  const sendSatelliteFilter = useCallback(
    async (serialNumber = 1581) => {
      const payload = new Uint8Array(4);
      const view = new DataView(payload.buffer);
      view.setUint32(0, Number(serialNumber), true);
      const hex = await sendCommand(0x01, Array.from(payload));
      dispatch(
        addUplinkLog({
          type: 'FILTER',
          message: `Satellite Filter #${serialNumber} configured`,
          hex,
          status: 'success',
        })
      );
    },
    [sendCommand, dispatch]
  );

  // Quick uplink commands
  const sendBlinkLed = useCallback(async () => {
    try {
      const hex = await sendCommand(0x80, [0xff, 0x00, 0x00]);
      dispatch(
        addUplinkLog({
          type: 'LED',
          message: 'RGB LED Blink command sent (Red)',
          hex,
          status: 'success',
        })
      );
      return true;
    } catch (err) {
      dispatch(
        addUplinkLog({
          type: 'LED',
          message: err.message,
          status: 'error',
        })
      );
      return false;
    }
  }, [sendCommand, dispatch]);

  const sendStartupSong = useCallback(async () => {
    try {
      const hex = await sendCommand(0x84, [0x00]);
      dispatch(
        addUplinkLog({
          type: 'SONG',
          message: 'Play Startup Song command sent',
          hex,
          status: 'success',
        })
      );
      return true;
    } catch (err) {
      dispatch(
        addUplinkLog({
          type: 'SONG',
          message: err.message,
          status: 'error',
        })
      );
      return false;
    }
  }, [sendCommand, dispatch]);

  const sendPing = useCallback(async () => {
    try {
      const hex = await sendCommand(0x12, [0x00]);
      dispatch(
        addUplinkLog({
          type: 'PING',
          message: 'OBC Info / Ping command sent',
          hex,
          status: 'success',
        })
      );
      return true;
    } catch (err) {
      dispatch(
        addUplinkLog({
          type: 'PING',
          message: err.message,
          status: 'error',
        })
      );
      return false;
    }
  }, [sendCommand, dispatch]);

  const triggerCameraCapture = useCallback(
    async (timeout = 35.0) => {
      try {
        dispatch(resetCameraState());
        // 1. Notify backend
        await fetch('/api/rascube/camera/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout, source: 'client_web_serial' }),
        }).catch(() => {});

        // 2. Transmit camera capture command to satellite: Port 0x13
        const hex = await sendCommand(0x13, [0x00]);
        dispatch(
          addUplinkLog({
            type: 'CAMERA',
            message: 'Camera capture triggered via OBC Port 0x13',
            hex,
            status: 'success',
          })
        );
        return true;
      } catch (err) {
        dispatch(
          addUplinkLog({
            type: 'CAMERA',
            message: err.message,
            status: 'error',
          })
        );
        return false;
      }
    },
    [sendCommand, dispatch]
  );

  // Read loop
  const startReading = useCallback(
    async (port) => {
      let buffer = new Uint8Array();
      keepReadingRef.current = true;

      while (port.readable && keepReadingRef.current) {
        try {
          readerRef.current = port.readable.getReader();

          while (keepReadingRef.current) {
            const { value, done } = await readerRef.current.read();
            if (done) break;
            if (value && value.length > 0) {
              const merged = new Uint8Array(buffer.length + value.length);
              merged.set(buffer);
              merged.set(value, buffer.length);
              buffer = merged;

              // Parse frames: [port, len, ...payload]
              while (buffer.length >= 2) {
                const portNum = buffer[0];
                const len = buffer[1];
                const frameLen = 2 + len;

                const isCameraBlock = (portNum === 0x15 || portNum === 0x20) && len === 242;
                const isTelemetry = portNum === 0x10 && len === 121;
                const isControl =
                  portNum === 0x00 ||
                  portNum === 0x01 ||
                  portNum === 0x02 ||
                  portNum === 0x03 ||
                  portNum === 0x0a ||
                  portNum === 0x12 ||
                  portNum === 0x13 ||
                  portNum === 0x80 ||
                  portNum === 0x84;

                if (isCameraBlock || isTelemetry || isControl) {
                  if (buffer.length < frameLen) {
                    break; // Wait for full frame
                  }

                  const frame = buffer.slice(0, frameLen);
                  buffer = buffer.slice(frameLen);
                  const hex = Array.from(frame)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('')
                    .toUpperCase();

                  if (isTelemetry) {
                    fetch('/api/rascube/telemetry/ingest', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ hex, source: 'client_web_serial' }),
                    })
                      .then((r) => r.json())
                      .then((res) => {
                        if (res.telemetry) {
                          dispatch(receiveLiveTelemetry(res.telemetry));
                        }
                      })
                      .catch((e) => console.warn('Telemetry ingest error:', e));
                  } else if (isCameraBlock) {
                    fetch('/api/rascube/camera/chunk/ingest', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ hex, source: 'client_web_serial' }),
                    })
                      .then((r) => r.json())
                      .then((res) => {
                        if (res.chunk) {
                          dispatch(receiveLiveCameraChunk(res.chunk));
                        }
                      })
                      .catch((e) => console.warn('Camera chunk ingest error:', e));
                  }
                } else {
                  // Skip invalid leading byte to resync
                  buffer = buffer.slice(1);
                }
              }
            }
          }
        } catch (readErr) {
          if (keepReadingRef.current) {
            console.warn('Web Serial stream interrupted:', readErr);
          }
          break;
        } finally {
          if (readerRef.current) {
            try {
              readerRef.current.releaseLock();
            } catch {
              // Ignore
            }
            readerRef.current = null;
          }
        }
      }
    },
    [dispatch]
  );

  // Connect handler
  const connect = useCallback(
    async ({ baudRate = 1000000, serialNumber = 1581 } = {}) => {
      setError(null);
      if (!isSupported) {
        throw new Error('Web Serial API is not supported in this browser.');
      }

      try {
        let port;
        try {
          port = await navigator.serial.requestPort({
            filters: [{ usbVendorId: USB_VID, usbProductId: USB_PID }],
          });
        } catch {
          // If filtered request fails or cancelled, try without filter
          port = await navigator.serial.requestPort();
        }

        await port.open({ baudRate: Number(baudRate) });

        portRef.current = port;
        setIsConnected(true);
        setPortInfo({ baudRate, serialNumber });

        dispatch(
          setConnectionState({
            isConnected: true,
            serialNumber,
            connectedPort: 'Client Web USB/Serial',
          })
        );
        dispatch(
          updateRascubeStatus({
            isConnected: true,
            serialNumber,
            source: 'client_web_serial',
          })
        );

        // Apply satellite filter
        await sendSatelliteFilter(serialNumber);

        // Start background reading
        startReading(port);

        return true;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [isSupported, dispatch, sendSatelliteFilter, startReading]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      keepReadingRef.current = false;
    };
  }, []);

  return {
    isSupported,
    isConnected,
    portInfo,
    error,
    connect,
    disconnect,
    sendBlinkLed,
    sendStartupSong,
    sendPing,
    triggerCameraCapture,
    sendSatelliteFilter,
    sendCommand,
  };
}
