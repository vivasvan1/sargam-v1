import * as Tone from 'tone';
import { SITAR_PROCESSOR_NAME, sitarProcessorCode } from './sitarProcessorCode';

// 11 Tarab (Sympathetic Strings) across Mandra (lower) and Madhya (middle) Saptaks:
// Lower octave: Sa, Re, Ga, Ma, Pa, Dha, Ni
// Middle octave: Sa, Re, Ga, Ma
const TARAB_SCALE_RATIOS = [
  0.5,        // Sa (lower)
  9 / 16,     // Re (lower)
  5 / 8,      // Ga (lower)
  2 / 3,      // Ma (lower)
  3 / 4,      // Pa (lower)
  5 / 6,      // Dha (lower)
  15 / 16,    // Ni (lower)
  1.0,        // Sa (middle)
  9 / 8,      // Re (middle)
  5 / 4,      // Ga (middle)
  4 / 3,      // Ma (middle)
];

export interface SitarSynthOptions {
  jawariBuzz?: number;
  damping?: number;
  tarabLevel?: number;
  tonic?: number;
}

export class SitarSynth {
  private static registeredContexts = new WeakSet<any>();

  private context: any;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private readyPromise: Promise<void>;

  // 5-Band Tumba Gourd & Tabli Wood Acoustic Formant Filters
  private helmholtzResonance: BiquadFilterNode | null = null;
  private tabliResonance: BiquadFilterNode | null = null;
  private woodCavityResonance: BiquadFilterNode | null = null;
  private neckTransmission: BiquadFilterNode | null = null;
  private bodyShelf: BiquadFilterNode | null = null;

  // 11 Tarab Sympathetic String Resonators
  private tarabFilters: BiquadFilterNode[] = [];
  private tarabGain: GainNode | null = null;

  // Master and Dry Gains
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;

  // Procedural Fallback Synth (Plucked string with comb filter)
  private fallbackSynth: Tone.PolySynth | null = null;
  private useFallback = false;

  private tonicFreq = 293.66; // D4 default
  private currentFrequency = 293.66;

  constructor(options?: SitarSynthOptions) {
    this.tonicFreq = options?.tonic ?? 293.66;
    this.readyPromise = this.initAudioGraph(options);
  }

  private async initAudioGraph(options?: SitarSynthOptions): Promise<void> {
    const toneCtx = Tone.getContext();
    this.context = toneCtx;
    const rawCtx = toneCtx.rawContext as any;

    try {
      // 1. Register AudioWorklet module
      if (!SitarSynth.registeredContexts.has(rawCtx)) {
        const blob = new Blob([sitarProcessorCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
          if (rawCtx._nativeAudioContext?.audioWorklet) {
            await rawCtx._nativeAudioContext.audioWorklet.addModule(blobUrl);
          } else if (rawCtx.audioWorklet && typeof rawCtx.audioWorklet.addModule === 'function') {
            await rawCtx.audioWorklet.addModule(blobUrl);
          } else if (typeof (toneCtx as any).addAudioWorkletModule === 'function') {
            await (toneCtx as any).addAudioWorkletModule(blobUrl);
          }
          SitarSynth.registeredContexts.add(rawCtx);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }

      // 2. Instantiate AudioWorkletNode using Tone's context helper
      if (typeof toneCtx.createAudioWorkletNode === 'function') {
        this.workletNode = toneCtx.createAudioWorkletNode(SITAR_PROCESSOR_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          parameterData: {
            frequency: this.tonicFreq,
            jawariBuzz: options?.jawariBuzz ?? 0.45,
            damping: options?.damping ?? 0.996,
          },
        });
      }

      // 3. Construct 5-Band Tumba Gourd & Tabli Wood Acoustic Formant Filters
      // ~185 Hz: Deep Helmholtz air cavity resonance of the round dried pumpkin gourd
      this.helmholtzResonance = toneCtx.createBiquadFilter();
      this.helmholtzResonance.type = 'peaking';
      this.helmholtzResonance.frequency.value = 185;
      this.helmholtzResonance.Q.value = 2.4;
      this.helmholtzResonance.gain.value = 5.5;

      // ~290 Hz: Tabli wood soundboard plate flexural resonance
      this.tabliResonance = toneCtx.createBiquadFilter();
      this.tabliResonance.type = 'peaking';
      this.tabliResonance.frequency.value = 290;
      this.tabliResonance.Q.value = 2.2;
      this.tabliResonance.gain.value = 4.5;

      // ~750 Hz: Hollow cedar wood cavity resonance
      this.woodCavityResonance = toneCtx.createBiquadFilter();
      this.woodCavityResonance.type = 'peaking';
      this.woodCavityResonance.frequency.value = 750;
      this.woodCavityResonance.Q.value = 2.8;
      this.woodCavityResonance.gain.value = 3.5;

      // ~1450 Hz: Neck (dandi) acoustic transmission
      this.neckTransmission = toneCtx.createBiquadFilter();
      this.neckTransmission.type = 'peaking';
      this.neckTransmission.frequency.value = 1450;
      this.neckTransmission.Q.value = 3.2;
      this.neckTransmission.gain.value = 3.0;

      // ~3400 Hz: High-frequency wood acoustic absorption
      this.bodyShelf = toneCtx.createBiquadFilter();
      this.bodyShelf.type = 'highshelf';
      this.bodyShelf.frequency.value = 3400;
      this.bodyShelf.gain.value = -4.0;

      if (this.workletNode) {
        // Chain the body formant network
        this.workletNode.connect(this.helmholtzResonance);
        this.helmholtzResonance.connect(this.tabliResonance);
        this.tabliResonance.connect(this.woodCavityResonance);
        this.woodCavityResonance.connect(this.neckTransmission);
        this.neckTransmission.connect(this.bodyShelf);

        // Dry gain
        this.dryGain = toneCtx.createGain();
        this.dryGain.gain.value = 0.85;
        this.bodyShelf.connect(this.dryGain);

        // 4. Construct 11-String Tarab Sympathetic Resonator Bank
        this.tarabGain = toneCtx.createGain();
        this.tarabGain.gain.value = options?.tarabLevel ?? 0.28;

        this.tarabFilters = [];
        for (let i = 0; i < TARAB_SCALE_RATIOS.length; i++) {
          const filter = toneCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.value = 36.0; // High Q for bright, bell-like sympathetic ringing
          filter.frequency.value = this.tonicFreq * TARAB_SCALE_RATIOS[i];

          this.bodyShelf.connect(filter);
          filter.connect(this.tarabGain);
          this.tarabFilters.push(filter);
        }

        // 5. Output Master Gain
        this.outputGain = toneCtx.createGain();
        this.outputGain.gain.value = 1.0;

        this.dryGain.connect(this.outputGain);
        this.tarabGain.connect(this.outputGain);
        this.isReady = true;
      } else {
        throw new Error('createAudioWorkletNode returned null');
      }
    } catch (err) {
      console.warn('[SitarSynth] AudioWorklet initialization note:', err);
      this.useFallback = true;
      // High-order plucked synth with bright metallic decay
      this.fallbackSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: {
          attack: 0.005,
          decay: 2.5,
          sustain: 0.08,
          release: 0.9,
        },
      });
      this.isReady = true;
    }
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  /**
   * Update the 11 Tarab sympathetic resonator frequencies to match a specific raag scale
   */
  public setTarabTuning(tonicFreq: number, scaleRatios?: number[]): void {
    this.tonicFreq = tonicFreq;
    const baseRatios = scaleRatios || [1.0, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
    const now = this.context?.currentTime ?? Tone.now();

    this.tarabFilters.forEach((filter, index) => {
      let freq = tonicFreq;
      if (index < 7) {
        // Lower octave (Mandra)
        freq = tonicFreq * 0.5 * (baseRatios[index] || 1.0);
      } else {
        // Middle octave (Madhya)
        const mIdx = index - 7;
        freq = tonicFreq * (baseRatios[mIdx % baseRatios.length] || 1.0);
      }
      try {
        filter.frequency.setValueAtTime(freq, now);
      } catch (e) {
        filter.frequency.value = freq;
      }
    });
  }

  /**
   * Normal Note: Mizrab attack and sustained decay
   */
  public triggerAttack(frequency: number, time?: number, velocity = 0.88): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());
    this.currentFrequency = frequency;

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttack(frequency, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');
    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(frequency, t);
    }

    this.workletNode.port.postMessage({
      type: 'pluck',
      voice: 0,
      frequency,
      velocity,
    });
  }

  public triggerRelease(time?: number, duration = 0.08): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerRelease([this.currentFrequency], t);
      return;
    }

    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'release',
      voice: 0,
      duration,
    });
  }

  public triggerAttackRelease(frequency: number, duration: number, time?: number, velocity = 0.88): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(frequency, duration, t, velocity);
      return;
    }

    this.triggerAttack(frequency, t, velocity);

    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const currTime = this.context?.currentTime ?? Tone.now();
    const delayMs = Math.max(0, (releaseTime - currTime) * 1000);
    setTimeout(() => {
      this.triggerRelease(releaseTime, 0.08);
    }, delayMs);
  }

  /**
   * Continuous Sitar Meend (Single pluck, smooth string deflection bend)
   */
  public triggerMeend(
    startFreq: number,
    targetFreq: number,
    time: number,
    startDur: number,
    slideDur: number,
    endDur: number,
    velocity = 0.92
  ): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(startFreq, startDur + slideDur + endDur, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');

    // Pluck once at startFreq
    this.triggerAttack(startFreq, t, velocity);

    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(startFreq, t);
      if (startDur > 0) {
        freqParam.setValueAtTime(startFreq, t + startDur);
      }

      const safeTarget = Math.max(20, targetFreq);
      const slideStart = t + startDur;
      const slideEnd = slideStart + slideDur;
      if (slideDur > 0) {
        freqParam.exponentialRampToValueAtTime(safeTarget, slideEnd);
      }

      if (endDur > 0) {
        freqParam.setValueAtTime(safeTarget, slideEnd + endDur);
      }
    }

    const totalDuration = startDur + slideDur + endDur;
    const releaseTime = t + Math.max(0.05, totalDuration - 0.05);
    const currTime = this.context?.currentTime ?? Tone.now();
    const delayMs = Math.max(0, (releaseTime - currTime) * 1000);
    setTimeout(() => {
      this.triggerRelease(releaseTime, 0.08);
    }, delayMs);
  }

  /**
   * Kan-Swar (Grace note touch into main swara in 35-50ms)
   */
  public triggerKan(
    mainFreq: number,
    kanFreq: number,
    time: number,
    duration: number,
    velocity = 0.88
  ): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(mainFreq, duration, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');

    this.triggerAttack(kanFreq, t, velocity);

    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(kanFreq, t);
      const kanGlideTime = Math.min(0.045, duration * 0.25);
      freqParam.exponentialRampToValueAtTime(mainFreq, t + kanGlideTime);
    }

    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const currTime = this.context?.currentTime ?? Tone.now();
    const delayMs = Math.max(0, (releaseTime - currTime) * 1000);
    setTimeout(() => {
      this.triggerRelease(releaseTime, 0.08);
    }, delayMs);
  }

  /**
   * Andolan (Slow, gentle microtonal oscillation)
   */
  public triggerAndolan(
    freq: number,
    time: number,
    duration: number,
    depthCents = 30,
    rateHz = 2.5,
    velocity = 0.85
  ): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(freq, duration, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');

    this.triggerAttack(freq, t, velocity);

    if (freqParam && duration > 0.15) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(freq, t);

      const period = 1.0 / rateHz;
      const steps = Math.floor(duration / (period / 4));
      const stepDur = period / 4;
      const ratio = Math.pow(2, depthCents / 1200);

      for (let s = 1; s <= steps; s++) {
        const stepTime = t + s * stepDur;
        if (stepTime >= t + duration) break;
        const phase = s % 4;
        let target = freq;
        if (phase === 1) target = freq * ratio;
        else if (phase === 3) target = freq / ratio;
        freqParam.exponentialRampToValueAtTime(target, stepTime);
      }
    }

    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const currTime = this.context?.currentTime ?? Tone.now();
    const delayMs = Math.max(0, (releaseTime - currTime) * 1000);
    setTimeout(() => {
      this.triggerRelease(releaseTime, 0.08);
    }, delayMs);
  }

  /**
   * Chikari Stroke (Rhythmic drone strings Sa', Sa'', Pa)
   */
  public triggerChikari(time?: number, tonicFreq?: number, velocity = 0.88): void {
    if (this.useFallback && this.fallbackSynth) {
      const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());
      const tonic = tonicFreq || this.tonicFreq;
      this.fallbackSynth.triggerAttackRelease([tonic * 2, tonic * 4, tonic * 1.5], 0.45, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'chikari',
      tonicFreq: tonicFreq || this.tonicFreq,
      velocity,
    });
  }

  public connect(destination: any): this {
    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.connect(destination);
      return this;
    }

    if (!this.outputGain) return this;
    try {
      Tone.connect(this.outputGain, destination);
    } catch {
      if (destination instanceof Tone.ToneAudioNode) {
        this.outputGain.connect(destination.input as any);
      } else {
        this.outputGain.connect(destination);
      }
    }
    return this;
  }

  public disconnect(): this {
    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.disconnect();
      return this;
    }
    this.outputGain?.disconnect();
    return this;
  }

  public dispose(): void {
    if (this.fallbackSynth) {
      this.fallbackSynth.dispose();
      this.fallbackSynth = null;
    }
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'releaseAll' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.helmholtzResonance?.disconnect();
    this.tabliResonance?.disconnect();
    this.woodCavityResonance?.disconnect();
    this.neckTransmission?.disconnect();
    this.bodyShelf?.disconnect();
    this.tarabFilters.forEach((f) => f.disconnect());
    this.tarabGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.isReady = false;
  }
}
