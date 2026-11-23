/**
 * SSTV Sync Pulse Detector
 * Detects 1200Hz sync pulses of various durations (5ms, 9ms, 20ms)
 * Based on xdsopl/robot36 Demodulator.java with tone coherence filtering
 */

import {
  Complex,
  Phasor,
  FrequencyModulation,
  SimpleMovingAverage,
  SchmittTrigger,
  Delay,
  ComplexConvolution,
} from './fm-demodulator';

export enum SyncPulseWidth {
  FiveMilliSeconds,
  NineMilliSeconds,
  TwentyMilliSeconds,
  None,
}

export interface SyncPulseDetection {
  detected: boolean;
  width: SyncPulseWidth;
  offset: number; // Sample offset where sync pulse ended
  frequencyOffset: number; // Frequency calibration offset
}

export class SyncDetector {
  private syncPulseFilter: SimpleMovingAverage;
  private baseBandLowPass: ComplexConvolution;
  private frequencyModulation: FrequencyModulation;
  private syncPulseTrigger: SchmittTrigger;
  private baseBandOscillator: Phasor;
  private syncPulseValueDelay: Delay;

  private syncPulseCounter: number = 0;
  private syncEnergySum: number = 0;
  private syncJitterSum: number = 0;

  private centerFrequency: number;
  private scanLineBandwidth: number;
  private syncPulseFrequencyValue: number;
  private syncPulseFrequencyTolerance: number;

  private syncPulse5msMinSamples: number;
  private syncPulse5msMaxSamples: number;
  private syncPulse9msMaxSamples: number;
  private syncPulse20msMaxSamples: number;
  private syncPulseFilterDelay: number;

  public static readonly SYNC_PULSE_FREQ = 1200;
  public static readonly BLACK_FREQ = 1500;
  public static readonly WHITE_FREQ = 2300;

  constructor(sampleRate: number) {
    this.scanLineBandwidth = SyncDetector.WHITE_FREQ - SyncDetector.BLACK_FREQ; // 800Hz
    this.frequencyModulation = new FrequencyModulation(this.scanLineBandwidth, sampleRate);

    const syncPulse5msSeconds = 0.005;
    const syncPulse9msSeconds = 0.009;
    const syncPulse20msSeconds = 0.020;

    const syncPulse5msMinSeconds = syncPulse5msSeconds / 2;
    const syncPulse5msMaxSeconds = (syncPulse5msSeconds + syncPulse9msSeconds) / 2;
    const syncPulse9msMaxSeconds = (syncPulse9msSeconds + syncPulse20msSeconds) / 2;
    const syncPulse20msMaxSeconds = syncPulse20msSeconds + syncPulse5msSeconds;

    this.syncPulse5msMinSamples = Math.round(syncPulse5msMinSeconds * sampleRate);
    this.syncPulse5msMaxSamples = Math.round(syncPulse5msMaxSeconds * sampleRate);
    this.syncPulse9msMaxSamples = Math.round(syncPulse9msMaxSeconds * sampleRate);
    this.syncPulse20msMaxSamples = Math.round(syncPulse20msMaxSeconds * sampleRate);

    const syncPulseFilterSeconds = syncPulse5msSeconds / 2;
    const syncPulseFilterSamples = Math.round(syncPulseFilterSeconds * sampleRate) | 1;
    this.syncPulseFilterDelay = (syncPulseFilterSamples - 1) / 2;
    this.syncPulseFilter = new SimpleMovingAverage(syncPulseFilterSamples);
    this.syncPulseValueDelay = new Delay(syncPulseFilterSamples);

    const lowestFrequency = 1000;
    const highestFrequency = 2800;
    const cutoffFrequency = (highestFrequency - lowestFrequency) / 2;
    const baseBandLowPassSeconds = 0.002;
    const baseBandLowPassSamples = Math.round(baseBandLowPassSeconds * sampleRate) | 1;
    this.baseBandLowPass = ComplexConvolution.createLowPassFilter(
      baseBandLowPassSamples,
      cutoffFrequency,
      sampleRate
    );
    this.centerFrequency = (lowestFrequency + highestFrequency) / 2; // 1900Hz
    this.baseBandOscillator = new Phasor(-this.centerFrequency, sampleRate);

    this.syncPulseFrequencyValue = this.normalizeFrequency(SyncDetector.SYNC_PULSE_FREQ);
    this.syncPulseFrequencyTolerance = (50 * 2) / this.scanLineBandwidth;

    const syncPorchFrequency = 1500;
    const syncHighFrequency = (SyncDetector.SYNC_PULSE_FREQ + syncPorchFrequency) / 2;
    const syncLowFrequency = (SyncDetector.SYNC_PULSE_FREQ + syncHighFrequency) / 2;
    const syncLowValue = this.normalizeFrequency(syncLowFrequency);
    const syncHighValue = this.normalizeFrequency(syncHighFrequency);

    this.syncPulseTrigger = new SchmittTrigger(syncLowValue, syncHighValue);
  }

  private normalizeFrequency(frequency: number): number {
    return ((frequency - this.centerFrequency) * 2) / this.scanLineBandwidth;
  }

  /**
   * Process audio samples and detect coherent 1200 Hz sync pulses
   */
  process(samples: Float32Array, demodulated: Float32Array): SyncPulseDetection {
    let syncPulseDetected = false;
    let syncPulseWidth = SyncPulseWidth.None;
    let syncPulseOffset = 0;
    let frequencyOffset = 0;

    for (let i = 0; i < samples.length; i++) {
      let baseBand = new Complex(samples[i], 0).mul(this.baseBandOscillator.rotate());
      baseBand = this.baseBandLowPass.push(baseBand);

      const baseBandMag = Math.sqrt(baseBand.real * baseBand.real + baseBand.imag * baseBand.imag);
      const frequencyValue = this.frequencyModulation.demod(baseBand);

      const syncPulseValue = this.syncPulseFilter.avg(frequencyValue);
      const syncPulseDelayedValue = this.syncPulseValueDelay.push(syncPulseValue);

      demodulated[i] = frequencyValue;

      if (!this.syncPulseTrigger.latch(syncPulseValue)) {
        // Inside potential 1200 Hz sync pulse
        this.syncPulseCounter++;
        this.syncEnergySum += baseBandMag;
        this.syncJitterSum += Math.abs(frequencyValue - syncPulseValue);
      } else {
        const avgEnergy =
          this.syncPulseCounter > 0 ? this.syncEnergySum / this.syncPulseCounter : 0;
        const avgJitter =
          this.syncPulseCounter > 0 ? this.syncJitterSum / this.syncPulseCounter : 999;

        const isCoherentTone = avgEnergy >= 0.002 && avgJitter <= 0.65;

        if (
          !isCoherentTone ||
          this.syncPulseCounter < this.syncPulse5msMinSamples ||
          this.syncPulseCounter > this.syncPulse20msMaxSamples ||
          Math.abs(syncPulseDelayedValue - this.syncPulseFrequencyValue) >
            this.syncPulseFrequencyTolerance
        ) {
          this.syncPulseCounter = 0;
          this.syncEnergySum = 0;
          this.syncJitterSum = 0;
        } else {
          if (this.syncPulseCounter < this.syncPulse5msMaxSamples) {
            syncPulseWidth = SyncPulseWidth.FiveMilliSeconds;
          } else if (this.syncPulseCounter < this.syncPulse9msMaxSamples) {
            syncPulseWidth = SyncPulseWidth.NineMilliSeconds;
          } else {
            syncPulseWidth = SyncPulseWidth.TwentyMilliSeconds;
          }

          syncPulseOffset = i - this.syncPulseFilterDelay;
          frequencyOffset = syncPulseDelayedValue - this.syncPulseFrequencyValue;
          syncPulseDetected = true;
          this.syncPulseCounter = 0;
          this.syncEnergySum = 0;
          this.syncJitterSum = 0;
        }
      }
    }

    return {
      detected: syncPulseDetected,
      width: syncPulseWidth,
      offset: syncPulseOffset,
      frequencyOffset,
    };
  }

  reset(): void {
    this.syncPulseFilter.reset();
    this.frequencyModulation.reset();
    this.syncPulseTrigger.reset();
    this.syncPulseValueDelay.reset();
    this.syncPulseCounter = 0;
    this.syncEnergySum = 0;
    this.syncJitterSum = 0;
  }
}
