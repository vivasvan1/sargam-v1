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
  private static registeredContexts = new WeakSet<AudioContext>();

  private context: AudioContext;
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

  private tonicFreq = 293.66; // D4 default
  private currentFrequency = 293.66;

  constructor(options?: SitarSynthOptions) {
    const rawCtx = (Tone.getContext().rawContext as AudioContext) || new AudioContext();
    this.context = rawCtx;
    this.tonicFreq = options?.tonic ?? 293.66;

    this.readyPromise = this.initAudioGraph(options);
  }

  private async initAudioGraph(options?: SitarSynthOptions): Promise<void> {
    // 1. Ensure AudioWorklet module is registered once on this context
    if (!SitarSynth.registeredContexts.has(this.context)) {
      const blob = new Blob([sitarProcessorCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        await this.context.audioWorklet.addModule(blobUrl);
        SitarSynth.registeredContexts.add(this.context);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }

    // 2. Instantiate AudioWorkletNode
    this.workletNode = new AudioWorkletNode(this.context, SITAR_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: {
        frequency: this.tonicFreq,
        jawariBuzz: options?.jawariBuzz ?? 0.38,
        damping: options?.damping ?? 0.995,
      },
    });

    // 3. Construct Tumba gourd & Tabli body formant filters
    // ~280 Hz: Helmholtz air cavity resonance of the dried pumpkin gourd
    this.airResonance = this.context.createBiquadFilter();
    this.airResonance.type = 'peaking';
    this.airResonance.frequency.value = 280;
    this.airResonance.Q.value = 2.2;
    this.airResonance.gain.value = 5.5;

    // ~780 Hz: Tabli wood soundboard plate flexural resonance
    this.woodResonance = this.context.createBiquadFilter();
    this.woodResonance.type = 'peaking';
    this.woodResonance.frequency.value = 780;
    this.woodResonance.Q.value = 2.6;
    this.woodResonance.gain.value = 4.0;

    // ~3200 Hz: Acoustic body roll-off
    this.bodyShelf = this.context.createBiquadFilter();
    this.bodyShelf.type = 'highshelf';
    this.bodyShelf.frequency.value = 3200;
    this.bodyShelf.gain.value = -3.5;

    // Chain the body formant filters
    this.workletNode.connect(this.airResonance);
    this.airResonance.connect(this.woodResonance);
    this.woodResonance.connect(this.bodyShelf);

    // Dry gain
    this.dryGain = this.context.createGain();
    this.dryGain.gain.value = 0.85;
    this.bodyShelf.connect(this.dryGain);

    // 4. Construct Tarab (Sympathetic Strings) Resonator Bank
    // A bank of 7 high-Q bandpass filters tuned to the notes of the raag scale
    this.tarabGain = this.context.createGain();
    this.tarabGain.gain.value = options?.tarabLevel ?? 0.22;

    this.tarabFilters = [];
    for (let i = 0; i < DEFAULT_SCALE_RATIOS.length; i++) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 32.0; // High Q for bell-like sympathetic ringing
      filter.frequency.value = this.tonicFreq * DEFAULT_SCALE_RATIOS[i];

      // Route string signal into tarab resonator
      this.bodyShelf.connect(filter);
      filter.connect(this.tarabGain);
      this.tarabFilters.push(filter);
    }

    // 5. Output Master Gain
    this.outputGain = this.context.createGain();
    this.outputGain.gain.value = 1.0;

    this.dryGain.connect(this.outputGain);
    this.tarabGain.connect(this.outputGain);

    this.isReady = true;
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
    this.tarabFilters.forEach((filter, index) => {
      const ratio = ratios[index % ratios.length];
      const oct = Math.floor(index / ratios.length);
      filter.frequency.setValueAtTime(tonicFreq * ratio * Math.pow(2, oct), this.context.currentTime);
    });
  }

  /**
   * Normal Note: Mizrab attack and sustained decay
   */
  public triggerAttack(frequency: number, time?: number, velocity = 0.85): void {
    if (!this.workletNode) return;
    const t = time !== undefined ? time : this.context.currentTime;
    this.currentFrequency = frequency;

    const freqParam = this.workletNode.parameters.get('frequency');
    if (freqParam) {
      freqParam.cancelScheduledValues(t);
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
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'release',
      voice: 0,
      duration,
    });
  }

  public triggerAttackRelease(frequency: number, duration: number, time?: number, velocity = 0.85): void {
    const t = time !== undefined ? time : this.context.currentTime;
    this.triggerAttack(frequency, t, velocity);

    // Schedule release at the end of the duration
    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const delayMs = Math.max(0, (releaseTime - this.context.currentTime) * 1000);
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
    if (!this.workletNode) return;
    const t = time !== undefined ? time : this.context.currentTime;
    const freqParam = this.workletNode.parameters.get('frequency');

    // 1. Pluck once at startFreq
    this.triggerAttack(startFreq, t, velocity);

    if (freqParam) {
      freqParam.cancelScheduledValues(t);
      // Hold startFreq for startDur
      freqParam.setValueAtTime(startFreq, t);
      if (startDur > 0) {
        freqParam.setValueAtTime(startFreq, t + startDur);
      }

      // Smoothly bend frequency over slideDur using exponential interpolation
      const safeTarget = Math.max(20, targetFreq);
      const slideStart = t + startDur;
      const slideEnd = slideStart + slideDur;
      if (slideDur > 0) {
        freqParam.exponentialRampToValueAtTime(safeTarget, slideEnd);
      }

      // Hold targetFreq for endDur
      if (endDur > 0) {
        freqParam.setValueAtTime(safeTarget, slideEnd + endDur);
      }
    }

    // Release string at the end of the meend
    const totalDuration = startDur + slideDur + endDur;
    const releaseTime = t + Math.max(0.05, totalDuration - 0.05);
    const delayMs = Math.max(0, (releaseTime - this.context.currentTime) * 1000);
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
    if (!this.workletNode) return;
    const t = time !== undefined ? time : this.context.currentTime;
    const freqParam = this.workletNode.parameters.get('frequency');

    // Pluck at the grace frequency
    this.triggerAttack(kanFreq, t, velocity);

    if (freqParam) {
      freqParam.cancelScheduledValues(t);
      freqParam.setValueAtTime(kanFreq, t);
      // Swiftly glide into the main note in 40ms
      const kanGlideTime = Math.min(0.045, duration * 0.25);
      freqParam.exponentialRampToValueAtTime(mainFreq, t + kanGlideTime);
    }

    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const delayMs = Math.max(0, (releaseTime - this.context.currentTime) * 1000);
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
    if (!this.workletNode) return;
    const t = time !== undefined ? time : this.context.currentTime;
    const freqParam = this.workletNode.parameters.get('frequency');

    this.triggerAttack(freq, t, velocity);

    if (freqParam && duration > 0.15) {
      freqParam.cancelScheduledValues(t);
      freqParam.setValueAtTime(freq, t);

      // Schedule periodic oscillation across the note duration
      const period = 1.0 / rateHz;
      const steps = Math.floor(duration / (period / 4));
      const stepDur = period / 4;
      const ratio = Math.pow(2, depthCents / 1200);

      for (let s = 1; s <= steps; s++) {
        const stepTime = t + s * stepDur;
        if (stepTime >= t + duration) break;
        const phase = (s % 4);
        let target = freq;
        if (phase === 1) target = freq * ratio;
        else if (phase === 3) target = freq / ratio;
        freqParam.exponentialRampToValueAtTime(target, stepTime);
      }
    }

    const releaseTime = t + Math.max(0.05, duration - 0.05);
    const delayMs = Math.max(0, (releaseTime - this.context.currentTime) * 1000);
    setTimeout(() => {
      this.triggerRelease(releaseTime, 0.08);
    }, delayMs);
  }

  /**
   * Chikari Stroke (Rhythmic drone strings Sa', Sa'', Pa)
   */
  public triggerChikari(time?: number, tonicFreq?: number, velocity = 0.85): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'chikari',
      tonicFreq: tonicFreq || this.tonicFreq,
      velocity,
    });
  }

  public connect(destination: AudioNode | Tone.ToneAudioNode): this {
    if (!this.outputGain) return this;
    if (destination instanceof Tone.ToneAudioNode) {
      this.outputGain.connect(destination.input as AudioNode);
    } else {
      this.outputGain.connect(destination);
    }
    return this;
  }

  public disconnect(): this {
    this.outputGain?.disconnect();
    return this;
  }

  public dispose(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'releaseAll' });
      this.workletNode.disconnect();
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
