import { useCallback, useEffect, useRef, useState } from 'react';
import { SSTVDecoder, DecoderStats } from './lib/decoder';
import { SSTV_MODES } from './lib/constants';
import { resolveUrl } from '../../utils/url.js';

export type SSTVMode = keyof typeof SSTV_MODES | 'AUTO';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
  isIcomCodec: boolean;
  sourceType?: 'server' | 'client_web';
  comPort?: string;
  rigctldComPort?: string;
  sampleRate?: number;
}

export interface ServerSerialPortInfo {
  port: string;
  role: string;
  recommendedFor?: string;
}

export interface AudioProcessorState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  stats: DecoderStats | null;
  activeDeviceLabel: string | null;
  inputSourceMode: 'server' | 'client_web';
  rigctldComPort: string;
  audioComPort: string;
  captureBackend: string | null;
}

const ICOM_CODEC_REGEX = /icom|ic-?9700|usb audio codec|burr-brown|pcm290|usb.*codec|\bcodec\b/i;

export function isIcomAudioDevice(label: string): boolean {
  return ICOM_CODEC_REGEX.test(label || '');
}

/**
 * Downmix 2-channel Icom IC-9700 USB Audio CODEC (Left = Main VFO, Right = Sub VFO)
 * to mono and apply soft AGC boost so quiet USB AF output levels drive SSTV sync & Bandscope reliably.
 */
export function normalizeAndDownmixStereo(
  left: Float32Array,
  right?: Float32Array | null
): Float32Array {
  const len = left.length;
  const mono = new Float32Array(len);

  if (right && right.length === len) {
    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < len; i++) {
      const al = Math.abs(left[i]);
      const ar = Math.abs(right[i]);
      if (al > peakL) peakL = al;
      if (ar > peakR) peakR = ar;
    }
    if (peakL > peakR * 1.5) {
      mono.set(left);
    } else if (peakR > peakL * 1.5) {
      mono.set(right);
    } else {
      for (let i = 0; i < len; i++) {
        mono[i] = (left[i] + right[i]) * 0.5;
      }
    }
  } else {
    mono.set(left);
  }

  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
  }

  // Soft AGC: boost active audio (> -62 dBFS) toward 0.45 amplitude (max 25x gain)
  if (peak > 0.0008 && peak < 0.35) {
    const gain = Math.min(25.0, 0.45 / peak);
    for (let i = 0; i < len; i++) {
      const v = mono[i] * gain;
      mono[i] = v > 1.0 ? 1.0 : v < -1.0 ? -1.0 : v;
    }
  }

  return mono;
}

export function useAudioProcessor(mode: SSTVMode = 'AUTO') {
  const [state, setState] = useState<AudioProcessorState>({
    isRecording: false,
    isSupported: true,
    error: null,
    stats: null,
    activeDeviceLabel: 'USB Audio CODEC — Icom IC-9700 (48000 Hz Sound Card • rigctld: COM3 → :4532)',
    inputSourceMode: 'server',
    rigctldComPort: 'COM3',
    audioComPort: 'USB Audio CODEC',
    captureBackend: null,
  });

  // Default to Auto-Lock USB Audio CODEC Sound Card (checks both host/browser USB Audio CODEC & server ALSA/PortAudio)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('usb-audio-codec:auto');
  const [audioDevices, setAudioDevices] = useState<AudioInputDeviceInfo[]>([
    {
      deviceId: 'usb-audio-codec:auto',
      label: 'USB Audio CODEC — Icom IC-9700 (Auto-Lock USB Sound Card • 48000 Hz)',
      isIcomCodec: true,
      sourceType: 'client_web',
      comPort: 'USB Audio CODEC',
      rigctldComPort: 'COM3',
      sampleRate: 48000,
    },
    {
      deviceId: 'server:icom-com4',
      label: '[SERVER Sound Card] Icom IC-9700 USB Audio CODEC (ALSA / PortAudio • rigctld: COM3 → :4532)',
      isIcomCodec: true,
      sourceType: 'server',
      comPort: 'USB Audio CODEC',
      rigctldComPort: 'COM3',
      sampleRate: 48000,
    },
    {
      deviceId: 'server:alsa-codec',
      label: '[SERVER ALSA] Icom IC-9700 plughw:CARD=CODEC,DEV=0 (48000 Hz • rigctld: COM3)',
      isIcomCodec: true,
      sourceType: 'server',
      comPort: 'USB Audio CODEC',
      rigctldComPort: 'COM3',
      sampleRate: 48000,
    },
  ]);
  const [serverSerialPorts, setServerSerialPorts] = useState<ServerSerialPortInfo[]>([
    { port: 'COM3', role: 'rigctld (CAT / CI-V Control • Hamlib Model 3081 → TCP :4532)', recommendedFor: 'rigctld' },
    { port: 'COM4', role: 'Auxiliary UART Port B (GPS / Data / PTT — Not Audio)', recommendedFor: 'aux' },
    { port: '/dev/ttyUSB0', role: 'Linux USB CI-V Port A (if00 • rigctld -m 3081)', recommendedFor: 'rigctld' },
    { port: '/dev/ttyUSB1', role: 'Linux USB Port B (if02 • Data / PTT)', recommendedFor: 'aux' },
  ]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<SSTVDecoder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const socketHandlerRef = useRef<((pkt: any) => void) | null>(null);
  const lastStatsUpdateMsRef = useRef<number>(0);
  const lastReportedLineRef = useRef<number>(-1);
  const lastReportedStateRef = useRef<string>('');

  const updateServerPorts = useCallback(
    async (nextRigCom: string, nextAudioCom: string, nextDeviceId?: string) => {
      setState((prev) => ({
        ...prev,
        rigctldComPort: nextRigCom,
        audioComPort: nextAudioCom || 'USB Audio CODEC',
        activeDeviceLabel: `USB Audio CODEC — Icom IC-9700 (48000 Hz Sound Card • rigctld: ${nextRigCom} → :4532)`,
      }));
      try {
        await fetch(resolveUrl('/api/direwolf/config'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rigctld_com_port: nextRigCom,
            audio_com_port: nextAudioCom || 'USB Audio CODEC',
            device_id: nextDeviceId || selectedDeviceId,
          }),
        });
      } catch {
        // Ignore offline errors during local unit tests
      }
    },
    [selectedDeviceId]
  );

  const refreshAudioDevices = useCallback(
    async (requestClientMicPermission = false): Promise<AudioInputDeviceInfo[]> => {
      const combined: AudioInputDeviceInfo[] = [
        {
          deviceId: 'usb-audio-codec:auto',
          label: 'USB Audio CODEC — Icom IC-9700 (Auto-Lock USB Sound Card • 48000 Hz)',
          isIcomCodec: true,
          sourceType: 'client_web',
          comPort: 'USB Audio CODEC',
          rigctldComPort: state.rigctldComPort || 'COM3',
          sampleRate: 48000,
        },
      ];

      // 1. Enumerate OS / Browser USB Sound Cards (unlock labels when user clicks Detect USB Audio)
      let discoveredBrowserCodecId: string | null = null;
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          if (
            requestClientMicPermission &&
            typeof navigator.mediaDevices.getUserMedia === 'function'
          ) {
            const tempStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
            });
            tempStream.getTracks().forEach((track) => track.stop());
          }

          const rawDevices = await navigator.mediaDevices.enumerateDevices();
          rawDevices
            .filter((d) => d.kind === 'audioinput')
            .forEach((d, idx) => {
              const rawLabel = d.label || `Audio Input Sound Card #${idx + 1}`;
              const isCodec = isIcomAudioDevice(rawLabel);
              const devId = d.deviceId || `client:${idx}`;
              if (isCodec && !discoveredBrowserCodecId && d.deviceId) {
                discoveredBrowserCodecId = d.deviceId;
              }
              combined.push({
                deviceId: devId,
                label: isCodec
                  ? `[USB AUDIO CODEC • IC-9700] ${rawLabel}`
                  : `[SOUND CARD] ${rawLabel}`,
                isIcomCodec: isCodec,
                sourceType: 'client_web',
                comPort: 'USB Audio CODEC',
                rigctldComPort: state.rigctldComPort || 'COM3',
                sampleRate: 48000,
              });
            });
        } catch {
          // Ignore browser media permission errors if denied
        }
      }

      // 2. Also fetch Server-side ALSA / PortAudio USB Audio CODEC devices from Backend
      try {
        const res = await fetch(resolveUrl('/api/direwolf/devices'));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.audioDevices)) {
            data.audioDevices.forEach((d: any) => {
              const id = String(d.deviceId);
              if (!combined.some((item) => item.deviceId === id)) {
                combined.push({
                  deviceId: id,
                  label: String(d.label),
                  isIcomCodec: Boolean(d.isIcomCodec),
                  sourceType: 'server',
                  comPort: 'USB Audio CODEC',
                  rigctldComPort: d.rigctldComPort || 'COM3',
                  sampleRate: Number(d.sampleRate || 48000),
                });
              }
            });
          }
          if (Array.isArray(data?.serialPorts) && data.serialPorts.length > 0) {
            setServerSerialPorts(data.serialPorts);
          }
          if (data?.activeConfig) {
            setState((prev) => ({
              ...prev,
              rigctldComPort: data.activeConfig.rigctldComPort || prev.rigctldComPort,
              audioComPort: 'USB Audio CODEC',
            }));
          }
        }
      } catch {
        // Fallback default server presets if backend is unreachable
      }

      if (!combined.some((d) => d.sourceType === 'server')) {
        combined.push(
          {
            deviceId: 'server:icom-com4',
            label: `[SERVER Sound Card] Icom IC-9700 USB Audio CODEC (ALSA / PortAudio • rigctld: ${state.rigctldComPort} → :4532)`,
            isIcomCodec: true,
            sourceType: 'server',
            comPort: 'USB Audio CODEC',
            rigctldComPort: state.rigctldComPort,
            sampleRate: 48000,
          },
          {
            deviceId: 'server:alsa-codec',
            label: `[SERVER ALSA] Icom IC-9700 plughw:CARD=CODEC,DEV=0 (48000 Hz • rigctld: ${state.rigctldComPort})`,
            isIcomCodec: true,
            sourceType: 'server',
            comPort: 'USB Audio CODEC',
            rigctldComPort: state.rigctldComPort,
            sampleRate: 48000,
          }
        );
      }

      setAudioDevices(combined);

      // If user clicked Detect USB Audio and we found a real USB Audio CODEC sound card, lock onto it
      if (requestClientMicPermission && discoveredBrowserCodecId) {
        setSelectedDeviceId(discoveredBrowserCodecId);
      }

      return combined;
    },
    [state.rigctldComPort]
  );

  useEffect(() => {
    void refreshAudioDevices(false);
  }, [refreshAudioDevices]);

  const calculateSNR = useCallback((): number | null => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) return null;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const sampleRate = audioContext.sampleRate;
    const nyquist = sampleRate / 2;

    const freqToBin = (freq: number) => Math.floor((freq / nyquist) * bufferLength);

    const signalBinStart = freqToBin(1200);
    const signalBinEnd = freqToBin(2300);
    const noiseBinLow1 = freqToBin(300);
    const noiseBinLow2 = freqToBin(1000);
    const noiseBinHigh1 = freqToBin(2500);
    const noiseBinHigh2 = freqToBin(4000);

    let signalPower = 0;
    let signalCount = 0;
    for (let i = signalBinStart; i <= signalBinEnd; i++) {
      signalPower += dataArray[i] * dataArray[i];
      signalCount++;
    }
    signalPower = signalPower / Math.max(1, signalCount);

    let noisePower = 0;
    let noiseCount = 0;
    for (let i = noiseBinLow1; i <= noiseBinLow2; i++) {
      noisePower += dataArray[i] * dataArray[i];
      noiseCount++;
    }
    for (let i = noiseBinHigh1; i <= noiseBinHigh2; i++) {
      noisePower += dataArray[i] * dataArray[i];
      noiseCount++;
    }
    noisePower = noisePower / Math.max(1, noiseCount);

    if (noisePower < 1) noisePower = 1;
    if (signalPower < 1) signalPower = 1;

    return 10 * Math.log10(signalPower / noisePower);
  }, []);

  const stopRecording = useCallback(() => {
    // Unsubscribe from Server Socket.IO audio stream if active
    const sock = typeof window !== 'undefined' ? (window as any).__socket : null;
    if (sock && socketHandlerRef.current) {
      sock.off('server-audio-pcm', socketHandlerRef.current);
      socketHandlerRef.current = null;
    }

    fetch(resolveUrl('/api/direwolf/audio/stop'), { method: 'POST' }).catch(() => {});

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (decoderRef.current) {
      decoderRef.current.stop();
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      captureBackend: null,
    }));
  }, []);

  const startRecording = useCallback(
    async (overrideDeviceId?: string) => {
      try {
        const targetChoice = overrideDeviceId ?? selectedDeviceId;
        const isAutoCodecChoice =
          targetChoice === 'usb-audio-codec:auto' || targetChoice === 'icom-auto';
        const isExplicitServerSource = targetChoice.startsWith('server:');

        const isAutoMode = mode === 'AUTO';
        const initialBaseMode: keyof typeof SSTV_MODES = isAutoMode ? 'ROBOT36' : mode;

        const maybeUpdateStats = () => {
          if (!decoderRef.current) return;
          const now = performance.now();
          const stats = decoderRef.current.getStats();
          const lineChanged = stats.currentLine !== lastReportedLineRef.current;
          const stateChanged = stats.state !== lastReportedStateRef.current;

          if (lineChanged || stateChanged || now - lastStatsUpdateMsRef.current >= 220) {
            lastStatsUpdateMsRef.current = now;
            lastReportedLineRef.current = stats.currentLine;
            lastReportedStateRef.current = stats.state;
            const snr = calculateSNR();
            setState((prev) => ({ ...prev, stats: { ...stats, snr } }));
          }
        };

        const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
        const hasMediaDevices =
          typeof navigator !== 'undefined' &&
          Boolean(navigator.mediaDevices) &&
          typeof navigator.mediaDevices.getUserMedia === 'function';

        // Helper to discover & unlock real USB Audio CODEC sound card in host/browser
        const findHostUsbAudioCodec = async (): Promise<{
          codecDeviceId: string | undefined;
          initialStream: MediaStream | null;
        }> => {
          if (!hasMediaDevices) {
            return { codecDeviceId: undefined, initialStream: null };
          }
          const baseConstraints: MediaTrackConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 2 },
            sampleRate: { ideal: 48000 },
          };

          let probeStream: MediaStream | null = null;
          let inputs: MediaDeviceInfo[] = [];
          try {
            if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
              const firstPass = await navigator.mediaDevices.enumerateDevices();
              inputs = firstPass.filter((d) => d.kind === 'audioinput');
            }
            const hasUnlockedLabels = inputs.some((d) => Boolean(d.label && d.label.trim()));
            if (!hasUnlockedLabels) {
              // Unlock device labels by requesting audio permission once
              probeStream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
              if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
                const secondPass = await navigator.mediaDevices.enumerateDevices();
                inputs = secondPass.filter((d) => d.kind === 'audioinput');
              }
            }
          } catch {
            // Permission or enumeration error handled below
          }

          // Refresh dropdown list with unlocked USB sound card labels
          if (inputs.length > 0) {
            void refreshAudioDevices(false);
          }

          const matchedCodec = inputs.find((d) => isIcomAudioDevice(d.label || ''));
          if (matchedCodec && matchedCodec.deviceId) {
            const activeTrackLabel = probeStream?.getAudioTracks()[0]?.label || '';
            if (probeStream && isIcomAudioDevice(activeTrackLabel)) {
              // Probe stream already opened the USB Audio CODEC directly!
              return { codecDeviceId: matchedCodec.deviceId, initialStream: probeStream };
            }
            if (probeStream) {
              probeStream.getTracks().forEach((t) => t.stop());
            }
            return { codecDeviceId: matchedCodec.deviceId, initialStream: null };
          }

          return { codecDeviceId: undefined, initialStream: probeStream };
        };

        // Helper to start Server ALSA / PortAudio USB Audio CODEC stream
        const startServerUsbAudioStream = async (serverDeviceId: string): Promise<boolean> => {
          const res = await fetch(resolveUrl('/api/direwolf/audio/start'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_id: serverDeviceId,
              rigctld_com_port: state.rigctldComPort,
              audio_com_port: 'USB Audio CODEC',
              sample_rate: 48000,
            }),
          });
          const data = await res.json().catch(() => ({}));
          const serverInfo = data?.status?.serverAudio;
          const backendName = String(serverInfo?.captureBackend || '');

          // Check if the server container actually opened a hardware USB Audio CODEC sound card
          const containerHasNoSoundCard =
            backendName.includes('no_audio_device_in_container') ||
            backendName.includes('No USB Audio CODEC');

          if (containerHasNoSoundCard && hasMediaDevices) {
            // Stop the empty container stream and let host/browser Web Audio open USB Audio CODEC
            fetch(resolveUrl('/api/direwolf/audio/stop'), { method: 'POST' }).catch(() => {});
            return false;
          }

          const serverSampleRate = 48000;
          if (hasAudioContext) {
            const audioContext = new AudioContext({ sampleRate: serverSampleRate });
            if (audioContext.state === 'suspended') {
              await audioContext.resume().catch(() => {});
            }
            audioContextRef.current = audioContext;
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyserRef.current = analyser;

            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0.0001;
            analyser.connect(silentGain);
            silentGain.connect(audioContext.destination);
            silentGainRef.current = silentGain;
          }

          decoderRef.current = new SSTVDecoder(serverSampleRate, initialBaseMode, isAutoMode);
          decoderRef.current.start();
          lastStatsUpdateMsRef.current = 0;
          lastReportedLineRef.current = -1;
          lastReportedStateRef.current = '';

          const sock = typeof window !== 'undefined' ? (window as any).__socket : null;
          if (sock) {
            const handleServerPcm = (pkt: any) => {
              if (!pkt || !Array.isArray(pkt.samples) || !decoderRef.current) return;
              const floatSamples = Float32Array.from(pkt.samples);
              decoderRef.current.processSamples(floatSamples);

              const ctx = audioContextRef.current;
              const analyser = analyserRef.current;
              if (ctx && analyser && floatSamples.length > 0) {
                try {
                  const buf = ctx.createBuffer(
                    1,
                    floatSamples.length,
                    pkt.sampleRate || serverSampleRate
                  );
                  buf.copyToChannel(floatSamples, 0);
                  const src = ctx.createBufferSource();
                  src.buffer = buf;
                  src.connect(analyser);
                  src.start();
                } catch {
                  // Ignore AudioContext scheduling errors
                }
              }

              maybeUpdateStats();
            };

            socketHandlerRef.current = handleServerPcm;
            sock.on('server-audio-pcm', handleServerPcm);
          }

          const matchedDev = audioDevices.find((d) => d.deviceId === serverDeviceId);
          const activeLabel =
            serverInfo?.deviceLabel ||
            matchedDev?.label ||
            `[SERVER Sound Card] Icom IC-9700 USB Audio CODEC (${backendName || 'ALSA/PortAudio'})`;

          setState((prev) => ({
            ...prev,
            isRecording: true,
            inputSourceMode: 'server',
            error: null,
            activeDeviceLabel: activeLabel,
            captureBackend: backendName || 'Server USB Audio CODEC',
            stats: decoderRef.current ? { ...decoderRef.current.getStats(), snr: null } : null,
          }));
          return true;
        };

        // 1. If user explicitly selected a Server ALSA/PortAudio device, try it first
        if (isExplicitServerSource) {
          const startedOnServer = await startServerUsbAudioStream(targetChoice);
          if (startedOnServer) {
            return;
          }
          // If server container has no /dev/snd sound card (e.g. Docker on Windows), fall through to Host USB Audio CODEC!
        }

        // 2. For Auto-Lock USB Audio CODEC (`usb-audio-codec:auto` / `icom-auto`) or Host Sound Card:
        let exactDeviceId: string | undefined;
        let preOpenedStream: MediaStream | null = null;

        if (isAutoCodecChoice || isExplicitServerSource) {
          const discovered = await findHostUsbAudioCodec();
          exactDeviceId = discovered.codecDeviceId;
          preOpenedStream = discovered.initialStream;

          // If host/browser does not have a local USB Audio CODEC (e.g. remote browser client) and we haven't tried server yet
          if (!exactDeviceId && !isExplicitServerSource) {
            try {
              const startedOnServer = await startServerUsbAudioStream('server:icom-com4');
              if (startedOnServer) {
                if (preOpenedStream) {
                  preOpenedStream.getTracks().forEach((t) => t.stop());
                }
                return;
              }
            } catch {
              // Server unavailable; continue with preOpenedStream or default Web Audio
            }
          }
        } else if (targetChoice && targetChoice !== 'default') {
          exactDeviceId = targetChoice;
        }

        if (!hasAudioContext || !hasMediaDevices) {
          throw new Error('USB Audio CODEC / Web Audio API not available');
        }

        const baseAudioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48000 },
        };

        const stream =
          preOpenedStream ||
          (await navigator.mediaDevices.getUserMedia({
            audio: exactDeviceId
              ? { ...baseAudioConstraints, deviceId: { exact: exactDeviceId } }
              : baseAudioConstraints,
          }));

        streamRef.current = stream;
        const rawTrackLabel = stream.getAudioTracks()[0]?.label || 'USB Audio CODEC Sound Card';
        const isCodecTrack = isIcomAudioDevice(rawTrackLabel);
        const activeTrackLabel = isCodecTrack
          ? `[USB AUDIO CODEC • IC-9700] ${rawTrackLabel}`
          : `[SOUND CARD] ${rawTrackLabel}`;

        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => {});
        }
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0.0001;
        silentGainRef.current = silentGain;

        decoderRef.current = new SSTVDecoder(audioContext.sampleRate, initialBaseMode, isAutoMode);
        decoderRef.current.start();
        lastStatsUpdateMsRef.current = 0;
        lastReportedLineRef.current = -1;
        lastReportedStateRef.current = '';

        let useScriptProcessor = false;
        try {
          if (typeof audioContext.createScriptProcessor === 'function') {
            const bufferSize = 4096;
            // Capture 2 channels (Left = Main VFO, Right = Sub VFO) from USB Audio CODEC and output 1 normalized mono channel
            const processor = audioContext.createScriptProcessor(bufferSize, 2, 1);
            processorNodeRef.current = processor;

            processor.onaudioprocess = (event) => {
              const left = event.inputBuffer.getChannelData(0);
              const right =
                event.inputBuffer.numberOfChannels > 1
                  ? event.inputBuffer.getChannelData(1)
                  : null;
              const normalizedMono = normalizeAndDownmixStereo(left, right);

              // Output normalized mono to AnalyserNode so Bandscope, Waveform & Waterfall show full boosted signal
              try {
                event.outputBuffer.getChannelData(0).set(normalizedMono);
              } catch {
                // Ignore if outputBuffer is read-only in mock test environments
              }

              if (decoderRef.current) {
                decoderRef.current.processSamples(normalizedMono);
                maybeUpdateStats();
              }
            };

            source.connect(processor);
            processor.connect(analyser);
            analyser.connect(silentGain);
            silentGain.connect(audioContext.destination);
            useScriptProcessor = true;
          }
        } catch {
          // Fallback to requestAnimationFrame polling
        }

        if (!useScriptProcessor) {
          source.connect(analyser);
          analyser.connect(silentGain);
          silentGain.connect(audioContext.destination);

          const pollAudio = () => {
            if (!analyserRef.current || !decoderRef.current) {
              return;
            }

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(dataArray);
            const normalized = normalizeAndDownmixStereo(dataArray, null);

            decoderRef.current.processSamples(normalized);
            maybeUpdateStats();

            animationFrameRef.current = requestAnimationFrame(pollAudio);
          };

          animationFrameRef.current = requestAnimationFrame(pollAudio);
        }

        setState((prev) => ({
          ...prev,
          isRecording: true,
          inputSourceMode: 'client_web',
          error: null,
          activeDeviceLabel: activeTrackLabel,
          captureBackend: `USB Audio CODEC (${audioContext.sampleRate} Hz Stereo Main+Sub AGC)`,
          stats: decoderRef.current ? { ...decoderRef.current.getStats(), snr: null } : null,
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to access USB Audio CODEC device';
        setState((prev) => ({
          ...prev,
          error,
          isRecording: false,
        }));
      }
    },
    [audioDevices, calculateSNR, mode, refreshAudioDevices, selectedDeviceId, state.rigctldComPort]
  );

  const resetDecoder = useCallback(() => {
    if (decoderRef.current) {
      decoderRef.current.reset();
      if (state.isRecording) {
        decoderRef.current.start();
      }
      lastReportedLineRef.current = -1;
      lastReportedStateRef.current = '';
      setState((prev) => ({
        ...prev,
        stats: decoderRef.current ? { ...decoderRef.current.getStats(), snr: null } : null,
      }));
    }
  }, [state.isRecording]);

  const getImageData = useCallback((): Uint8ClampedArray | null => {
    return decoderRef.current ? decoderRef.current.getImageData() : null;
  }, []);

  const getDimensions = useCallback(() => {
    if (decoderRef.current) {
      return decoderRef.current.getDimensions();
    }
    const fallbackKey: keyof typeof SSTV_MODES = mode === 'AUTO' ? 'ROBOT36' : mode;
    const modeConfig = SSTV_MODES[fallbackKey];
    return { width: modeConfig.width, height: modeConfig.height };
  }, [mode]);

  const getAnalyser = useCallback((): AnalyserNode | null => {
    return analyserRef.current;
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    state,
    audioDevices,
    serverSerialPorts,
    selectedDeviceId,
    setSelectedDeviceId,
    updateServerPorts,
    refreshAudioDevices,
    startRecording,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  };
}
