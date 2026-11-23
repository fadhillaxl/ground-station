import { SSTV_MODES, SSTVMode, SAMPLE_RATE } from './constants';
import { SyncDetector, SyncPulseWidth } from './sync-detector';
import { Robot36LineDecoder } from './robot36-line-decoder';
import { Robot72LineDecoder } from './robot72-line-decoder';
import { PD120LineDecoder } from './pd120-line-decoder';
import { PD160LineDecoder } from './pd160-line-decoder';
import { PD180LineDecoder } from './pd180-line-decoder';
import { ScottieS1LineDecoder } from './scottie-s1-line-decoder';
import { ScottieS2LineDecoder } from './scottie-s2-line-decoder';

export enum DecoderState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  DECODING_IMAGE = 'DECODING_IMAGE',
}

export interface DecoderStats {
  state: DecoderState;
  mode: string | null;
  modeKey: keyof typeof SSTV_MODES;
  autoDetect: boolean;
  currentLine: number;
  totalLines: number;
  progress: number;
  frequency: number;
  signalStrength: number; // 0-100 percentage
  snr: number | null; // Signal-to-Noise Ratio in dB (null if not available)
}

type LineDecoderInstance =
  | Robot36LineDecoder
  | Robot72LineDecoder
  | PD120LineDecoder
  | PD160LineDecoder
  | PD180LineDecoder
  | ScottieS1LineDecoder
  | ScottieS2LineDecoder;

/**
 * Main SSTV Decoder with automatic SSTV signal & mode detection.
 * Does NOT decode scanlines until a coherent SSTV sync pulse train is confirmed.
 */
export class SSTVDecoder {
  private mode: SSTVMode;
  private modeName: keyof typeof SSTV_MODES;
  private autoDetect: boolean;
  private state: DecoderState = DecoderState.IDLE;
  private imageData: Uint8ClampedArray;
  private currentLine: number = 0;
  private sampleRate: number;

  // Audio & FM demodulated circular buffers (7 seconds max)
  private audioBuffer: Float32Array;
  private demodulatedBuffer: Float32Array;
  private bufferWritePos: number = 0;
  private bufferSize: number;

  // Sync detection & line decoder
  private syncDetector: SyncDetector;
  private lineDecoder: LineDecoderInstance;

  // Confirmed frame sync tracking
  private lastSyncPos: number = -1;
  private lastSyncWidth: SyncPulseWidth | null = null;
  private missedSyncCount: number = 0;

  // Candidate sync tracking during LISTENING (pre-detection gate)
  private firstCandidateSyncPos: number = -1;
  private candidateSyncPos: number = -1;
  private candidateModeKey: keyof typeof SSTV_MODES | null = null;
  private consecutiveSyncMatches: number = 0;
  private lastCandidateSamplePos: number = 0;

  // Frequency calibration & signal strength
  private frequencyOffset: number = 0;
  private signalStrength: number = 0;
  private sampleCounter: number = 0;
  private absoluteSamplePosition: number = 0;

  constructor(
    sampleRate: number = SAMPLE_RATE,
    modeName: keyof typeof SSTV_MODES = 'ROBOT36',
    autoDetect: boolean = true
  ) {
    this.sampleRate = sampleRate;
    this.modeName = modeName;
    this.mode = SSTV_MODES[modeName];
    this.autoDetect = autoDetect;

    this.imageData = new Uint8ClampedArray(this.mode.width * this.mode.height * 4);
    this.clearImageData();

    this.bufferSize = Math.floor(sampleRate * 7);
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.demodulatedBuffer = new Float32Array(this.bufferSize);

    this.syncDetector = new SyncDetector(sampleRate);
    this.lineDecoder = this.createLineDecoder(modeName);
  }

  private createLineDecoder(modeName: keyof typeof SSTV_MODES): LineDecoderInstance {
    if (modeName === 'ROBOT36') return new Robot36LineDecoder(this.sampleRate);
    if (modeName === 'ROBOT72') return new Robot72LineDecoder(this.sampleRate);
    if (modeName === 'SCOTTIE_S1') return new ScottieS1LineDecoder(this.sampleRate);
    if (modeName === 'SCOTTIE_S2') return new ScottieS2LineDecoder(this.sampleRate);
    if (modeName === 'PD120') return new PD120LineDecoder(this.sampleRate);
    if (modeName === 'PD160') return new PD160LineDecoder(this.sampleRate);
    if (modeName === 'PD180') return new PD180LineDecoder(this.sampleRate);
    return new Robot36LineDecoder(this.sampleRate);
  }

  private clearImageData(): void {
    for (let i = 0; i < this.imageData.length; i += 4) {
      this.imageData[i] = 0;
      this.imageData[i + 1] = 0;
      this.imageData[i + 2] = 0;
      this.imageData[i + 3] = 255;
    }
  }

  private applyDetectedMode(newModeKey: keyof typeof SSTV_MODES): void {
    if (this.modeName === newModeKey) return;
    this.modeName = newModeKey;
    this.mode = SSTV_MODES[newModeKey];
    this.imageData = new Uint8ClampedArray(this.mode.width * this.mode.height * 4);
    this.clearImageData();
    this.lineDecoder = this.createLineDecoder(newModeKey);
  }

  /**
   * Match the time interval (in ms) between two consecutive 1200 Hz sync pulses
   * to an SSTV mode scanline duration.
   */
  private matchModeFromSyncInterval(
    intervalMs: number,
    pulseWidth: SyncPulseWidth
  ): keyof typeof SSTV_MODES | null {
    const candidates: Array<{
      key: keyof typeof SSTV_MODES;
      minMs: number;
      maxMs: number;
    }> = [
      { key: 'ROBOT36', minMs: 141, maxMs: 159 },
      { key: 'SCOTTIE_S2', minMs: 264, maxMs: 289 },
      { key: 'ROBOT72', minMs: 290, maxMs: 315 },
      { key: 'SCOTTIE_S1', minMs: 410, maxMs: 446 },
      { key: 'PD120', minMs: 482, maxMs: 524 },
      { key: 'PD180', minMs: 725, maxMs: 775 },
      { key: 'PD160', minMs: 780, maxMs: 830 },
    ];

    if (!this.autoDetect) {
      const activeRule = candidates.find((c) => c.key === this.modeName);
      if (activeRule && intervalMs >= activeRule.minMs && intervalMs <= activeRule.maxMs) {
        return this.modeName;
      }
      return null;
    }

    for (const c of candidates) {
      if (intervalMs >= c.minMs && intervalMs <= c.maxMs) {
        // PD modes use 20ms sync pulses, Robot/Scottie use 9ms sync pulses (allow slight tolerance)
        if (
          (c.key === 'PD120' || c.key === 'PD160' || c.key === 'PD180') &&
          pulseWidth === SyncPulseWidth.FiveMilliSeconds
        ) {
          continue;
        }
        return c.key;
      }
    }

    return null;
  }

  /**
   * Process incoming audio samples
   */
  processSamples(samples: Float32Array): void {
    const rms = Math.sqrt(samples.reduce((sum, val) => sum + val * val, 0) / samples.length);
    const currentStrength = Math.min(100, rms * 500);
    this.signalStrength = this.signalStrength * 0.8 + currentStrength * 0.2;

    if (this.state === DecoderState.IDLE) {
      return;
    }

    this.sampleCounter += samples.length;

    const demodulated = new Float32Array(samples.length);
    const result = this.syncDetector.process(samples, demodulated);

    for (let i = 0; i < samples.length; i++) {
      this.audioBuffer[this.bufferWritePos] = samples[i];
      this.demodulatedBuffer[this.bufferWritePos] = demodulated[i];
      this.bufferWritePos = (this.bufferWritePos + 1) % this.bufferSize;
    }

    // Expire stale candidate sync pulses if > 1.2s passes without a follow-up sync pulse
    if (
      this.state === DecoderState.LISTENING &&
      this.candidateSyncPos !== -1 &&
      this.absoluteSamplePosition - this.lastCandidateSamplePos > this.sampleRate * 1.2
    ) {
      this.firstCandidateSyncPos = -1;
      this.candidateSyncPos = -1;
      this.candidateModeKey = null;
      this.consecutiveSyncMatches = 0;
    }

    if (
      result.detected &&
      (result.width === SyncPulseWidth.NineMilliSeconds ||
        result.width === SyncPulseWidth.TwentyMilliSeconds)
    ) {
      const syncEndPos =
        (this.bufferWritePos - samples.length + result.offset + this.bufferSize) % this.bufferSize;

      if (this.state === DecoderState.LISTENING) {
        // Gate: Do NOT decode until a periodic SSTV sync pulse train is confirmed
        if (this.candidateSyncPos !== -1) {
          const distance = this.distanceInBuffer(this.candidateSyncPos, syncEndPos);
          const intervalMs = (distance / this.sampleRate) * 1000;
          const matchedMode = this.matchModeFromSyncInterval(intervalMs, result.width);

          if (
            matchedMode &&
            (this.candidateModeKey === null || this.candidateModeKey === matchedMode)
          ) {
            this.candidateModeKey = matchedMode;
            this.consecutiveSyncMatches += 1;

            // Fast modes (< 320ms, e.g. Robot 36) require 2 consecutive matching intervals
            // (3 coherent sync pulses) to prevent false-triggering on room noise.
            const requiredMatches = intervalMs < 320 ? 2 : 1;

            if (this.consecutiveSyncMatches >= requiredMatches) {
              this.applyDetectedMode(matchedMode);
              this.clearImageData();
              this.currentLine = 0;
              this.lineDecoder.reset();
              this.frequencyOffset = result.frequencyOffset;
              this.state = DecoderState.DECODING_IMAGE;
              this.missedSyncCount = 0;

              // Decode the buffered lines that confirmed the SSTV lock
              if (requiredMatches === 2 && this.firstCandidateSyncPos !== -1) {
                this.decodeLine(this.firstCandidateSyncPos, this.candidateSyncPos);
              }
              this.decodeLine(this.candidateSyncPos, syncEndPos);

              this.lastSyncPos = syncEndPos;
              this.lastSyncWidth = result.width;
              this.firstCandidateSyncPos = -1;
              this.candidateSyncPos = -1;
              this.consecutiveSyncMatches = 0;
            } else {
              this.firstCandidateSyncPos = this.candidateSyncPos;
              this.candidateSyncPos = syncEndPos;
              this.lastCandidateSamplePos = this.absoluteSamplePosition;
            }
          } else {
            // Interval did not match: treat this pulse as a fresh first candidate
            this.firstCandidateSyncPos = -1;
            this.candidateSyncPos = syncEndPos;
            this.candidateModeKey = null;
            this.consecutiveSyncMatches = 0;
            this.lastCandidateSamplePos = this.absoluteSamplePosition;
          }
        } else {
          this.candidateSyncPos = syncEndPos;
          this.lastCandidateSamplePos = this.absoluteSamplePosition;
        }
      } else if (this.state === DecoderState.DECODING_IMAGE) {
        if (
          this.lastSyncPos === -1 ||
          this.distanceInBuffer(this.lastSyncPos, syncEndPos) > this.sampleRate * 0.1
        ) {
          this.frequencyOffset = result.frequencyOffset;

          if (this.lastSyncPos !== -1) {
            this.decodeLine(this.lastSyncPos, syncEndPos);
          }

          this.lastSyncPos = syncEndPos;
          this.lastSyncWidth = result.width;
          this.missedSyncCount = 0;

          if (this.currentLine >= this.mode.height) {
            // Full frame decoded: return to LISTENING and preserve image on screen
            this.state = DecoderState.LISTENING;
            this.lastSyncPos = -1;
          }
        }
      }
    }

    // Flywheel sync fallback ONLY when already in DECODING_IMAGE (locked onto a real SSTV signal)
    // and bounded to at most 3 consecutive missed sync pulses so it stops immediately if signal ends.
    if (
      this.state === DecoderState.DECODING_IMAGE &&
      this.lastSyncPos !== -1 &&
      this.currentLine < this.mode.height
    ) {
      const expectedLineSamples = Math.round((this.mode.scanTime / 1000) * this.sampleRate);
      const flywheelThreshold = Math.round(expectedLineSamples * 1.35);

      while (
        this.currentLine < this.mode.height &&
        this.distanceInBuffer(this.lastSyncPos, this.bufferWritePos) >= flywheelThreshold
      ) {
        if (this.missedSyncCount >= 3 || this.signalStrength < 6) {
          // Signal lost or transmission ended: return to LISTENING without decoding noise
          this.state = DecoderState.LISTENING;
          this.lastSyncPos = -1;
          this.firstCandidateSyncPos = -1;
          this.candidateSyncPos = -1;
          this.consecutiveSyncMatches = 0;
          break;
        }

        const syntheticSyncEnd = (this.lastSyncPos + expectedLineSamples) % this.bufferSize;
        this.decodeLine(this.lastSyncPos, syntheticSyncEnd);
        this.lastSyncPos = syntheticSyncEnd;
        this.missedSyncCount += 1;

        if (this.currentLine >= this.mode.height) {
          this.state = DecoderState.LISTENING;
          this.lastSyncPos = -1;
          break;
        }
      }
    }

    this.absoluteSamplePosition += samples.length;
  }

  private distanceInBuffer(start: number, end: number): number {
    if (end >= start) {
      return end - start;
    }
    return this.bufferSize - start + end;
  }

  private decodeLine(startPos: number, endPos: number): void {
    const lineLength = this.distanceInBuffer(startPos, endPos);

    const hasNegativeTiming = 'getBeginSamples' in this.lineDecoder;
    const beginOffset = hasNegativeTiming ? (this.lineDecoder as any).getBeginSamples() : 0;
    const endOffset = hasNegativeTiming ? (this.lineDecoder as any).getEndSamples() : lineLength;

    const totalSamples = hasNegativeTiming ? endOffset - beginOffset : lineLength;
    const extractStart = hasNegativeTiming
      ? (startPos + beginOffset + this.bufferSize) % this.bufferSize
      : startPos;

    const lineSamples = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const pos = (extractStart + i) % this.bufferSize;
      lineSamples[i] = this.demodulatedBuffer[pos];
    }

    const syncPulsePos = hasNegativeTiming ? -beginOffset : 0;
    const line = this.lineDecoder.decodeScanLine(lineSamples, syncPulsePos, this.frequencyOffset);

    if (line && line.height > 0) {
      const pixelsPerLine = line.width;
      const numLines = line.height;

      for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
        const targetLine = this.currentLine + lineIdx;
        if (targetLine >= this.mode.height) continue;

        for (let x = 0; x < pixelsPerLine && x < this.mode.width; x++) {
          const srcIdx = (lineIdx * pixelsPerLine + x) * 4;
          const destIdx = (targetLine * this.mode.width + x) * 4;

          this.imageData[destIdx] = line.pixels[srcIdx];
          this.imageData[destIdx + 1] = line.pixels[srcIdx + 1];
          this.imageData[destIdx + 2] = line.pixels[srcIdx + 2];
          this.imageData[destIdx + 3] = 255;
        }
      }

      this.currentLine += numLines;
    }
  }

  getImageData(): Uint8ClampedArray {
    return this.imageData;
  }

  getStats(): DecoderStats {
    return {
      state: this.state,
      mode: this.mode.name,
      modeKey: this.modeName,
      autoDetect: this.autoDetect,
      currentLine: this.currentLine,
      totalLines: this.mode.height,
      progress: (this.currentLine / this.mode.height) * 100,
      frequency: Math.round(1900 + this.frequencyOffset),
      signalStrength: Math.round(this.signalStrength),
      snr: null,
    };
  }

  getDimensions(): { width: number; height: number } {
    return {
      width: this.mode.width,
      height: this.mode.height,
    };
  }

  setAutoDetect(enabled: boolean): void {
    this.autoDetect = enabled;
  }

  reset(): void {
    this.currentLine = 0;
    this.bufferWritePos = 0;
    this.lastSyncPos = -1;
    this.lastSyncWidth = null;
    this.missedSyncCount = 0;
    this.firstCandidateSyncPos = -1;
    this.candidateSyncPos = -1;
    this.candidateModeKey = null;
    this.consecutiveSyncMatches = 0;
    this.lastCandidateSamplePos = 0;
    this.frequencyOffset = 0;
    this.sampleCounter = 0;
    this.absoluteSamplePosition = 0;

    this.syncDetector.reset();
    this.lineDecoder.reset();
    this.audioBuffer.fill(0);
    this.demodulatedBuffer.fill(0);
    this.clearImageData();
  }

  start(): void {
    this.reset();
    // Enter LISTENING state first: wait for confirmed SSTV sync train before decoding lines
    this.state = DecoderState.LISTENING;
  }

  stop(): void {
    this.state = DecoderState.IDLE;
  }
}
