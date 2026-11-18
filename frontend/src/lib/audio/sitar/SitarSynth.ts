import * as Tone from 'tone';
import { SITAR_PROCESSOR_NAME, sitarProcessorCode } from './sitarProcessorCode';

// Default Hindustani scale ratios relative to Sa:
// Sa (1.0), komal Re (16/15), Shuddha Re (9/8), komal Ga (6/5), Shuddha Ga (5/4),
// Shuddha Ma (4/3), Tivra Ma (45/32), Pa (3/2), komal Dha (8/5), Shuddha Dha (5/3),
// komal Ni (9/5), Shuddha Ni (15/8)
const DEFAULT_SCALE_RATIOS = [
  1.0,         // Sa
  9 / 8,       // Re
  5 / 4,       // Ga
  4 / 3,       // Ma
  3 / 2,       // Pa
  5 / 3,       // Dha
  15 / 8,      // Ni
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

  // Body formant filters (Tumba gourd & Tabli wood acoustics)
  private airResonance: BiquadFilterNode | null = null;
  private woodResonance: BiquadFilterNode | null = null;
  private bodyShelf: BiquadFilterNode | null = null;

  // Tarab sympathetic string resonators
  private tarabFilters: BiquadFilterNode[] = [];
  private tarabGain: GainNode | null = null;

  // Gain nodes
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;

  // Fallback synth for non-worklet environments
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
      // 1. Ensure AudioWorklet module is registered once on this context
      if (!SitarSynth.registeredContexts.has(rawCtx)) {
        const blob = new Blob([sitarProcessorCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
          if (rawCtx.audioWorklet && typeof rawCtx.audioWorklet.addModule === 'function') {
            await rawCtx.audioWorklet.addModule(blobUrl);
          } else if (rawCtx._nativeAudioContext?.audioWorklet) {
            await rawCtx._nativeAudioContext.audioWorklet.addModule(blobUrl);
          }
          SitarSynth.registeredContexts.add(rawCtx);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }

      // 2. Instantiate AudioWorkletNode using Tone's context helper to guarantee context compatibility
      if (typeof toneCtx.createAudioWorkletNode === 'function') {
        this.workletNode = toneCtx.createAudioWorkletNode(SITAR_PROCESSOR_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          parameterData: {
            frequency: this.tonicFreq,
            jawariBuzz: options?.jawariBuzz ?? 0.38,
            damping: options?.damping ?? 0.995,
          },
        });
      }

      // 3. Construct Tumba gourd & Tabli body formant filters using toneCtx
      this.airResonance = toneCtx.createBiquadFilter();
      this.airResonance.type = 'peaking';
      this.airResonance.frequency.value = 280;
      this.airResonance.Q.value = 2.2;
      this.airResonance.gain.value = 5.5;

      this.woodResonance = toneCtx.createBiquadFilter();
      this.woodResonance.type = 'peaking';
      this.woodResonance.frequency.value = 780;
      this.woodResonance.Q.value = 2.6;
      this.woodResonance.gain.value = 4.0;

      this.bodyShelf = toneCtx.createBiquadFilter();
      this.bodyShelf.type = 'highshelf';
      this.bodyShelf.frequency.value = 3200;
      this.bodyShelf.gain.value = -3.5;

      // Chain the body formant filters
      if (this.workletNode) {
        this.workletNode.connect(this.airResonance);
        this.airResonance.connect(this.woodResonance);
        this.woodResonance.connect(this.bodyShelf);

        // Dry gain
        this.dryGain = toneCtx.createGain();
        this.dryGain.gain.value = 0.85;
        this.bodyShelf.connect(this.dryGain);

        // 4. Construct Tarab (Sympathetic Strings) Resonator Bank
        this.tarabGain = toneCtx.createGain();
        this.tarabGain.gain.value = options?.tarabLevel ?? 0.22;

        this.tarabFilters = [];
        for (let i = 0; i < DEFAULT_SCALE_RATIOS.length; i++) {
          const filter = toneCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.value = 32.0;
          filter.frequency.value = this.tonicFreq * DEFAULT_SCALE_RATIOS[i];

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
      console.warn('[SitarSynth] AudioWorklet not available, falling back to procedural synth:', err);
      this.useFallback = true;
      this.fallbackSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.015,
          decay: 2.2,
          sustain: 0.1,
          release: 0.8,
        },
      });
      this.isReady = true;
    }
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  /**
   * Update the Tarab sympathetic resonator frequencies to match a specific raag scale
   */
  public setTarabTuning(tonicFreq: number, scaleRatios?: number[]): void {
    this.tonicFreq = tonicFreq;
    const ratios = scaleRatios || DEFAULT_SCALE_RATIOS;
    const now = this.context?.currentTime ?? Tone.now();
    this.tarabFilters.forEach((filter, index) => {
      const ratio = ratios[index % ratios.length];
      const oct = Math.floor(index / ratios.length);
      try {
        filter.frequency.setValueAtTime(tonicFreq * ratio * Math.pow(2, oct), now);
      } catch (e) {
        filter.frequency.value = tonicFreq * ratio * Math.pow(2, oct);
      }
    });
  }

  /**
   * Normal Note: Mizrab attack and sustained decay
   */
  public triggerAttack(frequency: number, time?: number, velocity = 0.85): void {
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

  public triggerAttackRelease(frequency: number, duration: number, time?: number, velocity = 0.85): void {
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
    velocity = 0.9
  ): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(startFreq, startDur + slideDur + endDur, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');

    // 1. Pluck once at startFreq
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
    velocity = 0.85
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
    velocity = 0.8
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
  public triggerChikari(time?: number, tonicFreq?: number, velocity = 0.85): void {
    if (this.useFallback && this.fallbackSynth) {
      const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());
      const tonic = tonicFreq || this.tonicFreq;
      this.fallbackSynth.triggerAttackRelease([tonic * 2, tonic * 4, tonic * 1.5], 0.4, t, velocity);
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
    this.airResonance?.disconnect();
    this.woodResonance?.disconnect();
    this.bodyShelf?.disconnect();
    this.tarabFilters.forEach((f) => f.disconnect());
    this.tarabGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.isReady = false;
  }
}
