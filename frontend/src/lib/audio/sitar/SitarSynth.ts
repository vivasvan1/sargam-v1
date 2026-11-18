import * as Tone from 'tone';
import { SITAR_PROCESSOR_NAME, sitarProcessorCode } from './sitarProcessorCode';

// 11 Tarab (Sympathetic Strings) across Mandra (lower) and Madhya (middle) Saptaks:
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

  // Body acoustic filters
  private dcBlocker: BiquadFilterNode | null = null;
  private gourdResonance: BiquadFilterNode | null = null;
  private tabliResonance: BiquadFilterNode | null = null;
  private fretboardPresence: BiquadFilterNode | null = null;
  private bodyShelf: BiquadFilterNode | null = null;

  // 11 Tarab Sympathetic String Resonators
  private tarabFilters: BiquadFilterNode[] = [];
  private tarabGain: GainNode | null = null;

  // Gains
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;

  // Fallback Synth
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
            trigger: 0,
            chikari: 0,
            jawariBuzz: options?.jawariBuzz ?? 0.45,
            damping: options?.damping ?? 0.9975,
          },
        });
      }

      // 3. DC Blocker & Body Acoustic Resonances
      // Highpass at 70 Hz blocks DC without degrading low bass Sa
      this.dcBlocker = toneCtx.createBiquadFilter();
      this.dcBlocker.type = 'highpass';
      this.dcBlocker.frequency.value = 70;
      this.dcBlocker.Q.value = 0.707;

      // ~285 Hz: Warm pumpkin gourd air resonance (Tumba)
      this.gourdResonance = toneCtx.createBiquadFilter();
      this.gourdResonance.type = 'peaking';
      this.gourdResonance.frequency.value = 285;
      this.gourdResonance.Q.value = 2.0;
      this.gourdResonance.gain.value = 3.5;

      // ~740 Hz: Tun/cedar wood soundboard resonance (Tabli)
      this.tabliResonance = toneCtx.createBiquadFilter();
      this.tabliResonance.type = 'peaking';
      this.tabliResonance.frequency.value = 740;
      this.tabliResonance.Q.value = 2.2;
      this.tabliResonance.gain.value = 3.0;

      // ~2400 Hz: Curved brass frets (Parda) acoustic presence
      this.fretboardPresence = toneCtx.createBiquadFilter();
      this.fretboardPresence.type = 'peaking';
      this.fretboardPresence.frequency.value = 2400;
      this.fretboardPresence.Q.value = 2.0;
      this.fretboardPresence.gain.value = 2.0;

      // ~4800 Hz: Gentle high shelf removing digital hash
      this.bodyShelf = toneCtx.createBiquadFilter();
      this.bodyShelf.type = 'highshelf';
      this.bodyShelf.frequency.value = 4800;
      this.bodyShelf.gain.value = -2.5;

      if (this.workletNode) {
        this.workletNode.connect(this.dcBlocker);
        this.dcBlocker.connect(this.gourdResonance);
        this.gourdResonance.connect(this.tabliResonance);
        this.tabliResonance.connect(this.fretboardPresence);
        this.fretboardPresence.connect(this.bodyShelf);

        // Dry gain
        this.dryGain = toneCtx.createGain();
        this.dryGain.gain.value = 0.9;
        this.bodyShelf.connect(this.dryGain);

        // 4. Construct 11-String Tarab Sympathetic Resonator Bank
        this.tarabGain = toneCtx.createGain();
        this.tarabGain.gain.value = options?.tarabLevel ?? 0.22;

        this.tarabFilters = [];
        for (let i = 0; i < TARAB_SCALE_RATIOS.length; i++) {
          const filter = toneCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.value = 30.0;
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
      console.warn('[SitarSynth] AudioWorklet not available, falling back:', err);
      this.useFallback = true;
      this.fallbackSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.012,
          decay: 2.2,
          sustain: 0.12,
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
   * Update the 11 Tarab sympathetic resonator frequencies to match a specific raag scale
   */
  public setTarabTuning(tonicFreq: number, scaleRatios?: number[]): void {
    this.tonicFreq = tonicFreq;
    const baseRatios = scaleRatios || [1.0, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
    const now = this.context?.currentTime ?? Tone.now();

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setTonic', tonicFreq });
    }

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
   * Normal Note: Mizrab attack and physical string vibration
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
    const trigParam = this.workletNode.parameters.get('trigger');

    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(frequency, t);
    }

    // Sample-accurate scheduled pluck pulse
    if (trigParam) {
      try {
        trigParam.cancelScheduledValues(t);
      } catch (e) {}
      trigParam.setValueAtTime(velocity, t);
      trigParam.setValueAtTime(0, t + 0.002);
    }

    // Immediate postMessage fallback if scheduled time is current
    const currTime = this.context?.currentTime ?? Tone.now();
    if (t <= currTime + 0.015) {
      this.workletNode.port.postMessage({
        type: 'pluck',
        voice: 0,
        frequency,
        velocity,
      });
    }
  }

  public triggerRelease(time?: number, duration = 0.12): void {
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

  /**
   * Plucked string attack: plays note with natural acoustic decay.
   * Unlike electronic synths, sitar strings are not cut off abruptly with setTimeout timers.
   */
  public triggerAttackRelease(frequency: number, duration: number, time?: number, velocity = 0.85): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease(frequency, duration, t, velocity);
      return;
    }

    this.triggerAttack(frequency, t, velocity);
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

    // Pluck once at startFreq
    this.triggerAttack(startFreq, t, velocity);

    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(startFreq, t);

      const slideStartTime = t + Math.max(0, startDur);
      if (slideDur > 0) {
        freqParam.setValueAtTime(startFreq, slideStartTime);
        freqParam.exponentialRampToValueAtTime(targetFreq, slideStartTime + slideDur);
      } else {
        freqParam.setValueAtTime(targetFreq, slideStartTime);
      }
    }
  }

  /**
   * Kan (Grace note / touch deflection)
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
      this.fallbackSynth.triggerAttackRelease(kanFreq, 0.04, t, velocity * 0.9);
      this.fallbackSynth.triggerAttackRelease(mainFreq, duration - 0.04, t + 0.04, velocity);
      return;
    }

    if (!this.workletNode) return;
    const freqParam = this.workletNode.parameters.get('frequency');

    // Pluck at grace note kanFreq
    this.triggerAttack(kanFreq, t, velocity);

    if (freqParam) {
      try {
        freqParam.cancelScheduledValues(t);
      } catch (e) {}
      freqParam.setValueAtTime(kanFreq, t);
      const kanGlideTime = Math.min(0.04, duration * 0.25);
      freqParam.exponentialRampToValueAtTime(mainFreq, t + kanGlideTime);
    }
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
  }

  /**
   * Chikari Stroke (Rhythmic drone strings Sa', Sa'', Pa)
   */
  public triggerChikari(time?: number, tonicFreq?: number, velocity = 0.85): void {
    const t = time !== undefined ? time : (this.context?.currentTime ?? Tone.now());
    const tonic = tonicFreq || this.tonicFreq;

    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.triggerAttackRelease([tonic * 2, tonic * 4, tonic * 1.5], 0.45, t, velocity);
      return;
    }

    if (!this.workletNode) return;
    const chikParam = this.workletNode.parameters.get('chikari');

    if (chikParam) {
      try {
        chikParam.cancelScheduledValues(t);
      } catch (e) {}
      chikParam.setValueAtTime(velocity, t);
      chikParam.setValueAtTime(0, t + 0.002);
    }

    const currTime = this.context?.currentTime ?? Tone.now();
    if (t <= currTime + 0.015) {
      this.workletNode.port.postMessage({
        type: 'chikari',
        tonicFreq: tonic,
        velocity,
      });
    }
  }

  public releaseAll(): void {
    if (this.useFallback && this.fallbackSynth) {
      this.fallbackSynth.releaseAll();
      return;
    }
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'releaseAll' });
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
    this.dcBlocker?.disconnect();
    this.gourdResonance?.disconnect();
    this.tabliResonance?.disconnect();
    this.fretboardPresence?.disconnect();
    this.bodyShelf?.disconnect();
    this.tarabFilters.forEach((f) => f.disconnect());
    this.tarabGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.isReady = false;
  }
}
