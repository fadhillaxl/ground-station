import { useCallback, useEffect, useRef, useState } from 'react';
import { SSTVDecoder, DecoderStats } from './lib/decoder';
import { SSTV_MODES } from './lib/constants';

export type SSTVMode = keyof typeof SSTV_MODES | 'AUTO';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
  isIcomCodec: boolean;
}

export interface AudioProcessorState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  stats: DecoderStats | null;
  activeDeviceLabel: string | null;
}

const ICOM_CODEC_REGEX = /icom|ic-?9700|usb audio codec|burr-brown|pcm290|usb.*codec|\bcodec\b/i;

export function isIcomAudioDevice(label: string): boolean {
  return ICOM_CODEC_REGEX.test(label || '');
}

export function useAudioProcessor(mode: SSTVMode = 'AUTO') {
  const [state, setState] = useState<AudioProcessorState>({
    isRecording: false,
    isSupported: false,
    error: null,
    stats: null,
    activeDeviceLabel: null,
  });

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('icom-auto');
  const [audioDevices, setAudioDevices] = useState<AudioInputDeviceInfo[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<SSTVDecoder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const lastStatsUpdateMsRef = useRef<number>(0);
  const lastReportedLineRef = useRef<number>(-1);
  const lastReportedStateRef = useRef<string>('');

  const refreshAudioDevices = useCallback(async (requestPermission = false): Promise<AudioInputDeviceInfo[]> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      if (requestPermission && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((track) => track.stop());
      }

      const rawDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs: AudioInputDeviceInfo[] = rawDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => {
          const label = d.label || `Audio Input #${idx + 1}`;
          return {
            deviceId: d.deviceId,
            label,
            isIcomCodec: isIcomAudioDevice(label),
          };
        });

      setAudioDevices(inputs);

      const icom = inputs.find((d) => d.isIcomCodec);
      if (icom) {
        setSelectedDeviceId((prev) => (prev === 'default' || prev === 'icom-auto' ? icom.deviceId : prev));
      }

      return inputs;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
    const hasMediaDevices =
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    setState((prev) => ({
      ...prev,
      isSupported: Boolean(hasAudioContext && hasMediaDevices),
    }));

    if (hasMediaDevices) {
      void refreshAudioDevices(false);
      if (typeof navigator.mediaDevices.addEventListener === 'function') {
        const handleDeviceChange = () => {
          void refreshAudioDevices(false);
        };
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        return () => {
          navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        };
      }
    }
    return undefined;
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
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
    }));
  }, []);

  const startRecording = useCallback(
    async (overrideDeviceId?: string) => {
      try {
        const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
        const hasMediaDevices =
          typeof navigator !== 'undefined' &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.getUserMedia === 'function';

        if (!hasAudioContext || !hasMediaDevices) {
          throw new Error('Web Audio API not supported in this browser');
        }

        const targetChoice = overrideDeviceId ?? selectedDeviceId;

        const baseAudioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };

        let exactDeviceId: string | undefined;
        if (targetChoice && targetChoice !== 'default' && targetChoice !== 'icom-auto') {
          exactDeviceId = targetChoice;
        } else if (targetChoice === 'icom-auto') {
          const knownIcom = audioDevices.find((d) => d.isIcomCodec && d.deviceId);
          if (knownIcom) {
            exactDeviceId = knownIcom.deviceId;
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: exactDeviceId
            ? { ...baseAudioConstraints, deviceId: { exact: exactDeviceId } }
            : baseAudioConstraints,
        });

        streamRef.current = stream;
        const activeTrackLabel = stream.getAudioTracks()[0]?.label || 'Default Audio Input';

        void refreshAudioDevices(false);

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        source.connect(analyser);

        const isAutoMode = mode === 'AUTO';
        const initialBaseMode: keyof typeof SSTV_MODES = isAutoMode ? 'ROBOT36' : mode;
        decoderRef.current = new SSTVDecoder(audioContext.sampleRate, initialBaseMode, isAutoMode);
        decoderRef.current.start();
        lastStatsUpdateMsRef.current = 0;
        lastReportedLineRef.current = -1;
        lastReportedStateRef.current = '';

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

        let useScriptProcessor = false;
        try {
          if (typeof audioContext.createScriptProcessor === 'function') {
            const bufferSize = 4096;
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            processorNodeRef.current = processor;

            processor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              if (decoderRef.current) {
                decoderRef.current.processSamples(inputData);
                maybeUpdateStats();
              }
            };

            analyser.connect(processor);
            processor.connect(audioContext.destination);
            useScriptProcessor = true;
          }
        } catch {
          // Fallback to requestAnimationFrame polling
        }

        if (!useScriptProcessor) {
          const silentGain = audioContext.createGain();
          silentGain.gain.value = 0.001;
          analyser.connect(silentGain);
          silentGain.connect(audioContext.destination);

          const pollAudio = () => {
            if (!analyserRef.current || !decoderRef.current) {
              return;
            }

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(dataArray);

            decoderRef.current.processSamples(dataArray);
            maybeUpdateStats();

            animationFrameRef.current = requestAnimationFrame(pollAudio);
          };

          animationFrameRef.current = requestAnimationFrame(pollAudio);
        }

        setState((prev) => ({
          ...prev,
          isRecording: true,
          error: null,
          activeDeviceLabel: activeTrackLabel,
          stats: decoderRef.current ? { ...decoderRef.current.getStats(), snr: null } : null,
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to access audio input device';
        setState((prev) => ({
          ...prev,
          error,
          isRecording: false,
        }));
      }
    },
    [audioDevices, calculateSNR, mode, refreshAudioDevices, selectedDeviceId]
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
    selectedDeviceId,
    setSelectedDeviceId,
    refreshAudioDevices,
    startRecording,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  };
}
