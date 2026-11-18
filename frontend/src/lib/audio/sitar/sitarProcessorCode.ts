/**
 * Sitar AudioWorklet Processor Source Code
 *
 * Implements a sample-accurate physical model of a traditional Indian sitar:
 * 1. Mizrab pluck exciter (metallic highpass click, string displacement ramp, soundboard knock).
 * 2. Fractional-delay digital waveguide with 4-point cubic Hermite interpolation.
 * 3. Dynamic Jawari non-linear bridge waveshaping (even & odd harmonic cascading shimmer).
 * 4. Dynamic amplitude-dependent bridge deflection twang (+15 cents attack pitch spike).
 * 5. Multi-voice support for Baj tar (main melody string) and 3 Chikari drone strings.
 */

export const SITAR_PROCESSOR_NAME = 'sitar-string-processor';

export const sitarProcessorCode = `
class SitarStringProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'frequency',
        defaultValue: 293.66, // D4
        minValue: 20,
        maxValue: 8000,
        automationRate: 'a-rate',
      },
      {
        name: 'jawariBuzz',
        defaultValue: 0.38,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'damping',
        defaultValue: 0.995,
        minValue: 0.85,
        maxValue: 0.9998,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();

    this.sampleRate = sampleRate || 44100;
    this.bufferSize = 4096;
    this.mask = this.bufferSize - 1;

    // Voices: 0 = main melody string, 1 = chikari 1 (Sa'), 2 = chikari 2 (Sa''), 3 = chikari 3 (Pa)
    this.voices = [];
    for (let v = 0; v < 4; v++) {
      this.voices.push({
        ringBuffer: new Float32Array(this.bufferSize),
        writePos: 0,
        filterState: 0,
        env: 0,
        active: false,
        isChikari: v > 0,
        chikariFreq: 293.66 * 2,
        releaseGain: 1.0,
        isReleasing: false,
        releaseRate: 0.001,
        excitationBuffer: new Float32Array(1024),
        excitationPos: 0,
        excitationLength: 0,
        velocity: 1.0,
      });
    }

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const data = event.data;
    if (!data) return;

    if (data.type === 'pluck') {
      const vIdx = data.voice || 0;
      const voice = this.voices[vIdx];
      if (!voice) return;

      const velocity = data.velocity !== undefined ? Math.max(0.1, Math.min(1.0, data.velocity)) : 0.85;
      const freq = data.frequency || 293.66;
      voice.velocity = velocity;
      voice.active = true;
      voice.isReleasing = false;
      voice.releaseGain = 1.0;
      voice.env = velocity;
      voice.filterState = 0;

      if (vIdx > 0) {
        voice.chikariFreq = freq;
      }

      // Generate Mizrab pluck excitation into excitationBuffer
      // Combination of metallic wire click (filtered noise), initial string displacement, and wood knock
      const excSamples = Math.min(1024, Math.floor(0.016 * this.sampleRate));
      voice.excitationLength = excSamples;
      voice.excitationPos = 0;

      for (let n = 0; n < excSamples; n++) {
        const t = n / excSamples;
        // 1. Asymmetric string displacement ramp
        const displacement = (1 - t) * Math.sin(Math.PI * Math.pow(t, 0.65));

        // 2. High-frequency metallic wire scrape/click (noise decaying in ~5ms)
        const clickNoise = (Math.random() * 2 - 1) * Math.exp(-n / (0.0045 * this.sampleRate));

        // 3. Soundboard wood knock (180 Hz damped sine)
        const knock = Math.sin((2 * Math.PI * 180 * n) / this.sampleRate) * Math.exp(-n / (0.014 * this.sampleRate));

        voice.excitationBuffer[n] = (displacement * 0.65 + clickNoise * 0.55 + knock * 0.25) * velocity;
      }
    } else if (data.type === 'chikari') {
      // Trigger all 3 chikari drone strings in rapid succession (a stroke across the strings)
      const tonic = data.tonicFreq || 293.66;
      const velocity = data.velocity || 0.8;

      // Chikari 1: Sa' (high Sa)
      this.triggerChikariVoice(1, tonic * 2, velocity, 0);
      // Chikari 2: Sa'' (higher Sa)
      this.triggerChikariVoice(2, tonic * 4, velocity * 0.85, 0.008);
      // Chikari 3: Pa (fifth)
      this.triggerChikariVoice(3, tonic * 1.5, velocity * 0.9, 0.016);
    } else if (data.type === 'release') {
      const vIdx = data.voice || 0;
      const voice = this.voices[vIdx];
      if (voice && voice.active) {
        voice.isReleasing = true;
        const durSec = data.duration || 0.08;
        voice.releaseRate = 1.0 / (durSec * this.sampleRate);
      }
    } else if (data.type === 'releaseAll') {
      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v];
        if (voice.active) {
          voice.isReleasing = true;
          voice.releaseRate = 1.0 / (0.06 * this.sampleRate);
        }
      }
    }
  }

  triggerChikariVoice(vIdx, freq, velocity, delaySec) {
    const voice = this.voices[vIdx];
    if (!voice) return;

    voice.chikariFreq = freq;
    voice.velocity = velocity;
    voice.active = true;
    voice.isReleasing = false;
    voice.releaseGain = 1.0;
    voice.env = velocity;
    voice.filterState = 0;

    const delaySamples = Math.floor(delaySec * this.sampleRate);
    const excSamples = Math.min(1024, Math.floor(0.012 * this.sampleRate) + delaySamples);
    voice.excitationLength = excSamples;
    voice.excitationPos = 0;

    for (let n = 0; n < excSamples; n++) {
      if (n < delaySamples) {
        voice.excitationBuffer[n] = 0;
      } else {
        const k = n - delaySamples;
        const t = k / (excSamples - delaySamples);
        const displacement = (1 - t) * Math.sin(Math.PI * Math.pow(t, 0.5));
        const clickNoise = (Math.random() * 2 - 1) * Math.exp(-k / (0.0035 * this.sampleRate));
        voice.excitationBuffer[n] = (displacement * 0.7 + clickNoise * 0.6) * velocity * 0.75;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output.length > 1 ? output[1] : null;
    const blockSize = left.length;

    const freqParam = parameters.frequency;
    const jawariParam = parameters.jawariBuzz;
    const dampingParam = parameters.damping;

    const baseJawari = jawariParam ? jawariParam[0] : 0.38;
    const baseDamping = dampingParam ? dampingParam[0] : 0.995;

    for (let i = 0; i < blockSize; i++) {
      let mixedSample = 0.0;

      // Process each voice
      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v];
        if (!voice.active) continue;

        // Determine fundamental frequency for this voice
        let f = voice.isChikari ? voice.chikariFreq : (freqParam.length > 1 ? freqParam[i] : freqParam[0]);
        if (f < 20) f = 20;
        if (f > 8000) f = 8000;

        // Dynamic pitch twang on attack (bridge contact shortening string)
        const twangFactor = 1.0 + 0.014 * voice.env * voice.velocity;
        const targetDelay = (this.sampleRate / (f * twangFactor));

        // Clamp delay to valid range
        const d = Math.max(2.0, Math.min(this.bufferSize - 4.0, targetDelay));
        const dInt = Math.floor(d);
        const dFrac = d - dInt;

        // 4-point Cubic Hermite Interpolation from ring buffer
        const r1 = (voice.writePos - dInt + this.bufferSize) & this.mask;
        const r0 = (r1 + 1) & this.mask;
        const r2 = (r1 - 1 + this.bufferSize) & this.mask;
        const r3 = (r1 - 2 + this.bufferSize) & this.mask;

        const s0 = voice.ringBuffer[r0];
        const s1 = voice.ringBuffer[r1];
        const s2 = voice.ringBuffer[r2];
        const s3 = voice.ringBuffer[r3];

        const c0 = s1;
        const c1 = 0.5 * (s2 - s0);
        const c2 = s0 - 2.5 * s1 + 2.0 * s2 - 0.5 * s3;
        const c3 = 0.5 * (s3 - s0) + 1.5 * (s1 - s2);
        const delayedSample = ((c3 * dFrac + c2) * dFrac + c1) * dFrac + c0;

        // Loop damping filter (frequency-dependent decay)
        const damping = voice.isChikari ? Math.min(0.992, baseDamping) : baseDamping;
        const filtered = damping * (0.58 * delayedSample + 0.42 * voice.filterState);
        voice.filterState = delayedSample;

        // Jawari Non-Linear Waveshaping (wide flat bridge contact buzz)
        // High amplitude creates upper harmonic bloom; softens as envelope decays
        const jawariBuzz = voice.isChikari ? baseJawari * 1.3 : baseJawari;
        const absVal = Math.abs(filtered);
        const dynamicBuzz = jawariBuzz * (0.8 + 0.9 * absVal);
        const sign = filtered >= 0 ? 1 : -1;
        
        let shaped = filtered + dynamicBuzz * sign * (filtered * filtered) - 0.14 * (filtered * filtered * filtered);

        // Soft clipper to prevent overflow
        if (shaped > 1.25) shaped = 1.25;
        else if (shaped < -1.25) shaped = -1.25;

        // Decay envelope tracker
        voice.env *= 0.9996;

        // Fetch excitation
        let exc = 0.0;
        if (voice.excitationPos < voice.excitationLength) {
          exc = voice.excitationBuffer[voice.excitationPos++];
        }

        // Write feedback + excitation into ring buffer
        voice.ringBuffer[voice.writePos] = shaped + exc;
        voice.writePos = (voice.writePos + 1) & this.mask;

        // Handle release
        if (voice.isReleasing) {
          voice.releaseGain -= voice.releaseRate;
          if (voice.releaseGain <= 0.0) {
            voice.releaseGain = 0.0;
            voice.active = false;
          }
        } else if (absVal < 0.00005 && voice.excitationPos >= voice.excitationLength) {
          // Natural decay termination
          voice.active = false;
        }

        const voiceOut = shaped * voice.releaseGain;
        mixedSample += voice.isChikari ? voiceOut * 0.6 : voiceOut;
      }

      left[i] = mixedSample;
      if (right) {
        right[i] = mixedSample;
      }
    }

    return true;
  }
}

registerProcessor('${SITAR_PROCESSOR_NAME}', SitarStringProcessor);
`;
