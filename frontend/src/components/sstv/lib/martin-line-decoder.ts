/**
 * Martin M1 / M2 Line Decoder
 * Decodes a single Martin M1 (146.432ms/channel) or Martin M2 (73.216ms/channel) scan line.
 *
 * Martin transmission order after 4.862ms sync pulse:
 *   SyncPorch (0.572ms) → Green → Sep (0.572ms) → Blue → Sep (0.572ms) → Red → Sep (0.572ms)
 */

import { ExponentialMovingAverage } from './fm-demodulator';

export interface DecodedLine {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  isOddLine: boolean;
}

export class MartinLineDecoder {
  private lowPassFilter: ExponentialMovingAverage;
  private readonly horizontalPixels = 320;
  private readonly channelSamples: number;
  private readonly greenBeginSamples: number;
  private readonly blueBeginSamples: number;
  private readonly redBeginSamples: number;
  private readonly totalSamples: number;

  constructor(sampleRate: number, channelMs: number = 146.432) {
    const syncPorchSec = 0.000572;
    const sepSec = 0.000572;
    const channelSec = channelMs / 1000.0;

    this.channelSamples = Math.round(channelSec * sampleRate);
    this.greenBeginSamples = Math.round(syncPorchSec * sampleRate);
    this.blueBeginSamples = Math.round((syncPorchSec + channelSec + sepSec) * sampleRate);
    this.redBeginSamples = Math.round((syncPorchSec + 2 * (channelSec + sepSec)) * sampleRate);
    this.totalSamples = this.redBeginSamples + this.channelSamples;

    this.lowPassFilter = new ExponentialMovingAverage();
  }

  private freqToLevel(frequency: number, offset: number): number {
    return 0.5 * (frequency - offset + 1.0);
  }

  private levelToRGB(level: number): number {
    return Math.max(0, Math.min(255, Math.round(level * 255)));
  }

  decodeScanLine(
    scanLineBuffer: Float32Array,
    syncPulseIndex: number = 0,
    frequencyOffset: number = 0
  ): DecodedLine | null {
    const available = scanLineBuffer.length - syncPulseIndex;
    if (available < Math.floor(this.totalSamples * 0.85)) {
      return null;
    }

    const len = Math.min(available, this.totalSamples);
    const scratchBuffer = new Float32Array(len);

    this.lowPassFilter.cutoff(this.horizontalPixels, 2 * this.channelSamples, 2);
    this.lowPassFilter.reset();

    for (let i = 0; i < len; i++) {
      scratchBuffer[i] = this.lowPassFilter.avg(scanLineBuffer[syncPulseIndex + i]);
    }

    this.lowPassFilter.reset();
    for (let i = len - 1; i >= 0; i--) {
      scratchBuffer[i] = this.freqToLevel(this.lowPassFilter.avg(scratchBuffer[i]), frequencyOffset);
    }

    const pixels = new Uint8ClampedArray(this.horizontalPixels * 4);

    for (let i = 0; i < this.horizontalPixels; i++) {
      const offsetInCh = Math.floor((i * this.channelSamples) / this.horizontalPixels);
      const gPos = Math.min(len - 1, this.greenBeginSamples + offsetInCh);
      const bPos = Math.min(len - 1, this.blueBeginSamples + offsetInCh);
      const rPos = Math.min(len - 1, this.redBeginSamples + offsetInCh);

      const r = Math.max(0, Math.min(1, scratchBuffer[rPos] ?? 0));
      const g = Math.max(0, Math.min(1, scratchBuffer[gPos] ?? 0));
      const b = Math.max(0, Math.min(1, scratchBuffer[bPos] ?? 0));

      pixels[i * 4] = this.levelToRGB(r);
      pixels[i * 4 + 1] = this.levelToRGB(g);
      pixels[i * 4 + 2] = this.levelToRGB(b);
      pixels[i * 4 + 3] = 255;
    }

    return {
      pixels,
      width: this.horizontalPixels,
      height: 1,
      isOddLine: false,
    };
  }

  reset(): void {
    this.lowPassFilter.reset();
  }
}
