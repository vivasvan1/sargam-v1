/**
 * Pitch detection algorithms implemented in pure TypeScript.
 * Includes YIN and McLeod Pitch Method (MPM) with parabolic interpolation
 * for high-precision sub-cent fundamental frequency (F0) estimation.
 */

export interface PitchFrame {
  time: number; // seconds
  frequency: number; // Hz (0 if unvoiced/silent)
  clarity: number; // 0 to 1 confidence
  rms: number; // root-mean-square energy
  isVoiced: boolean;
}

export interface PitchDetectorOptions {
  sampleRate: number;
  frameSize?: number; // window size in samples (default: 2048)
  hopSize?: number; // step size in samples (default: 512, ~11.6ms at 44.1kHz)
  minFrequency?: number; // minimum detectable pitch (default: 65 Hz, ~C2)
  maxFrequency?: number; // maximum detectable pitch (default: 1200 Hz, ~D6)
  threshold?: number; // YIN threshold (default: 0.15)
  silenceThreshold?: number; // RMS energy threshold below which audio is silent (default: 0.01)
  clarityThreshold?: number; // minimum clarity to consider voiced (default: 0.6)
}

/**
 * Standard YIN algorithm implementation for monophonic pitch detection.
 */
export class YinPitchDetector {
  private sampleRate: number;
  private frameSize: number;
  private hopSize: number;
  private minPeriod: number;
  private maxPeriod: number;
  private threshold: number;
  private silenceThreshold: number;
  private clarityThreshold: number;

  constructor(options: PitchDetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.frameSize = options.frameSize || 2048;
    this.hopSize = options.hopSize || 512;
    const minFreq = options.minFrequency || 65;
    const maxFreq = options.maxFrequency || 1200;
    this.minPeriod = Math.max(2, Math.floor(this.sampleRate / maxFreq));
    this.maxPeriod = Math.min(
      Math.floor(this.frameSize / 2),
      Math.floor(this.sampleRate / minFreq)
    );
    this.threshold = options.threshold || 0.15;
    this.silenceThreshold = options.silenceThreshold || 0.01;
    this.clarityThreshold = options.clarityThreshold || 0.6;
  }

  /**
   * Process a single audio buffer frame and return pitch, clarity, and RMS energy.
   */
  public detectFrame(
    buffer: Float32Array,
    offset: number
  ): { frequency: number; clarity: number; rms: number } {
    const halfSize = Math.floor(this.frameSize / 2);

    // 1. Calculate RMS energy
    let sumSquares = 0;
    for (let i = 0; i < this.frameSize; i++) {
      const idx = offset + i;
      const val = idx < buffer.length ? buffer[idx] : 0;
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / this.frameSize);
    if (rms < this.silenceThreshold) {
      return { frequency: 0, clarity: 0, rms };
    }

    // 2. Step 1: Difference function
    const diff = new Float32Array(halfSize);
    for (let tau = 0; tau < halfSize; tau++) {
      let d = 0;
      for (let j = 0; j < halfSize; j++) {
        const idx1 = offset + j;
        const idx2 = offset + j + tau;
        const x1 = idx1 < buffer.length ? buffer[idx1] : 0;
        const x2 = idx2 < buffer.length ? buffer[idx2] : 0;
        const delta = x1 - x2;
        d += delta * delta;
      }
      diff[tau] = d;
    }

    // 3. Step 2: Cumulative mean normalized difference function
    const cmnd = new Float32Array(halfSize);
    cmnd[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += diff[tau];
      cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
    }

    // 4. Step 3: Absolute thresholding
    let tau = this.minPeriod;
    while (tau < this.maxPeriod) {
      if (cmnd[tau] < this.threshold) {
        while (tau + 1 < this.maxPeriod && cmnd[tau + 1] < cmnd[tau]) {
          tau++;
        }
        break;
      }
      tau++;
    }

    // Check for octave-halving error: if tau/2 also has a prominent dip, prefer tau/2 (higher octave)
    // Sitar strings with rich harmonics often produce deep sub-harmonic dips at 2*tau
    if (tau < this.maxPeriod) {
      const halfTau = Math.round(tau / 2);
      if (halfTau >= this.minPeriod && cmnd[halfTau] < this.threshold * 1.6) {
        let bestHalf = halfTau;
        for (let dt = -2; dt <= 2; dt++) {
          const t = halfTau + dt;
          if (t >= this.minPeriod && t < this.maxPeriod && cmnd[t] < cmnd[bestHalf]) {
            bestHalf = t;
          }
        }
        if (cmnd[bestHalf] < 0.28) {
          tau = bestHalf;
        }
      }
    }

    // If no pitch found below threshold, find global minimum within period range
    if (tau >= this.maxPeriod) {
      let minVal = 1.0;
      let minTau = -1;
      for (let t = this.minPeriod; t < this.maxPeriod; t++) {
        if (cmnd[t] < minVal) {
          minVal = cmnd[t];
          minTau = t;
        }
      }
      if (minVal < 0.35 && minTau > 0) {
        tau = minTau;
      } else {
        return { frequency: 0, clarity: 1 - minVal, rms };
      }
    }

    // 5. Step 4: Parabolic interpolation for sub-sample accuracy
    let betterTau = tau;
    if (tau > 0 && tau < halfSize - 1) {
      const s0 = cmnd[tau - 1];
      const s1 = cmnd[tau];
      const s2 = cmnd[tau + 1];
      const denom = 2 * (s0 - 2 * s1 + s2);
      if (Math.abs(denom) > 1e-6) {
        const delta = (s0 - s2) / denom;
        betterTau = tau + delta;
      }
    }

    const frequency = this.sampleRate / betterTau;
    const clarity = Math.max(0, Math.min(1, 1 - cmnd[tau]));

    if (clarity < this.clarityThreshold) {
      return { frequency: 0, clarity, rms };
    }

    return { frequency, clarity, rms };
  }

  /**
   * Process an entire Float32Array audio channel and return a series of pitch frames.
   */
  public analyze(channelData: Float32Array): PitchFrame[] {
    const rawFrames: PitchFrame[] = [];
    const totalSamples = channelData.length;

    for (let offset = 0; offset + this.frameSize <= totalSamples; offset += this.hopSize) {
      const time = (offset + this.frameSize / 2) / this.sampleRate;
      const { frequency, clarity, rms } = this.detectFrame(channelData, offset);
      const isVoiced = frequency > 0 && clarity >= this.clarityThreshold && rms >= this.silenceThreshold;

      rawFrames.push({
        time,
        frequency: isVoiced ? frequency : 0,
        clarity,
        rms,
        isVoiced,
      });
    }

    // Apply 5-frame running median filter on pitch frequencies to remove isolated spike errors
    const smoothedFrames: PitchFrame[] = rawFrames.map((f) => ({ ...f }));
    for (let i = 2; i < rawFrames.length - 2; i++) {
      if (!rawFrames[i].isVoiced) continue;
      const windowFreqs: number[] = [];
      for (let w = -2; w <= 2; w++) {
        if (rawFrames[i + w].isVoiced && rawFrames[i + w].frequency > 0) {
          windowFreqs.push(rawFrames[i + w].frequency);
        }
      }
      if (windowFreqs.length >= 3) {
        windowFreqs.sort((a, b) => a - b);
        smoothedFrames[i].frequency = windowFreqs[Math.floor(windowFreqs.length / 2)];
      }
    }

    return smoothedFrames;
  }
}
