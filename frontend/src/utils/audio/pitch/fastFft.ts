/**
 * High-performance Radix-2 Cooley-Tukey FFT & Harmonic Product Spectrum (HPS).
 * Implemented in pure TypeScript with zero external dependencies.
 *
 * Used to validate candidate fundamental frequencies, eliminate subharmonics,
 * and suppress octave-jumping errors in polyphonic/tanpura-accompanied audio.
 */

export class FastFFT {
  public readonly size: number;
  private readonly log2n: number;
  private readonly bitRev: Uint32Array;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly window: Float32Array;

  // Reusable work buffers to avoid garbage collection allocations
  private readonly workReal: Float32Array;
  private readonly workImag: Float32Array;
  private readonly magSpectrum: Float32Array;
  private readonly hpsBuffer: Float32Array;

  constructor(size = 2048) {
    if ((size & (size - 1)) !== 0) {
      throw new Error(`FastFFT size must be a power of 2, received ${size}`);
    }
    this.size = size;
    this.log2n = Math.round(Math.log2(size));

    this.bitRev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let rev = 0;
      let temp = i;
      for (let j = 0; j < this.log2n; j++) {
        rev = (rev << 1) | (temp & 1);
        temp >>= 1;
      }
      this.bitRev[i] = rev;
    }

    const half = size / 2;
    this.cosTable = new Float32Array(half);
    this.sinTable = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Hann window
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }

    this.workReal = new Float32Array(size);
    this.workImag = new Float32Array(size);
    this.magSpectrum = new Float32Array(half);
    this.hpsBuffer = new Float32Array(Math.floor(half / 4));
  }

  /**
   * In-place Radix-2 Decimation-in-Time FFT.
   */
  public transform(real: Float32Array, imag: Float32Array): void {
    const n = this.size;

    // Bit reversal permutation
    for (let i = 0; i < n; i++) {
      const j = this.bitRev[i];
      if (i < j) {
        const tr = real[i];
        real[i] = real[j];
        real[j] = tr;

        const ti = imag[i];
        imag[i] = imag[j];
        imag[j] = ti;
      }
    }

    // Cooley-Tukey butterflies
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;

      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const tableIdx = j * step;
          const c = this.cosTable[tableIdx];
          const s = this.sinTable[tableIdx];

          const uR = real[i + j];
          const uI = imag[i + j];

          const vR = real[i + j + halfLen] * c - imag[i + j + halfLen] * s;
          const vI = real[i + j + halfLen] * s + imag[i + j + halfLen] * c;

          real[i + j] = uR + vR;
          imag[i + j] = uI + vI;

          real[i + j + halfLen] = uR - vR;
          imag[i + j + halfLen] = uI - vI;
        }
      }
    }
  }

  /**
   * Computes the single-sided magnitude spectrum |X(k)| for an input audio frame.
   * Returns a Float32Array of length (size / 2).
   */
  public computeMagnitude(frame: Float32Array): Float32Array {
    const n = this.size;
    const len = Math.min(frame.length, n);

    for (let i = 0; i < len; i++) {
      this.workReal[i] = frame[i] * this.window[i];
      this.workImag[i] = 0;
    }
    for (let i = len; i < n; i++) {
      this.workReal[i] = 0;
      this.workImag[i] = 0;
    }

    this.transform(this.workReal, this.workImag);

    const half = n / 2;
    for (let k = 0; k < half; k++) {
      const r = this.workReal[k];
      const im = this.workImag[k];
      this.magSpectrum[k] = Math.sqrt(r * r + im * im);
    }

    return this.magSpectrum;
  }

  /**
   * Computes the Harmonic Product Spectrum (HPS) of the input magnitude spectrum.
   * HPS downsamples the spectrum by factors 1, 2, 3, 4 and multiplies them:
   * HPS(f) = M(f) * M(2f) * M(3f) * M(4f)
   *
   * True fundamental frequencies will exhibit intense peaks, while subharmonics
   * (e.g. f0/2) are naturally suppressed because their odd harmonics have near-zero energy.
   */
  public computeHPS(mag: Float32Array, numHarmonics = 4): Float32Array {
    const half = mag.length;
    const hpsLen = Math.min(this.hpsBuffer.length, Math.floor(half / numHarmonics));
    const hps = this.hpsBuffer;
    const invH = 1.0 / numHarmonics;

    for (let k = 1; k < hpsLen; k++) {
      let prod = mag[k] * 1000.0;
      for (let h = 2; h <= numHarmonics; h++) {
        prod *= (mag[k * h] * 1000.0);
      }
      hps[k] = Math.pow(Math.max(1e-12, prod), invH) * 0.001;
    }

    return hps;
  }

  /**
   * Evaluates the HPS score at an arbitrary continuous frequency (Hz) using linear interpolation.
   */
  public getHpsScore(hps: Float32Array, freqHz: number, sampleRate: number): number {
    const bin = (freqHz * this.size) / sampleRate;
    if (bin < 1 || bin >= hps.length - 1) return 0;

    const bin0 = Math.floor(bin);
    const frac = bin - bin0;
    return (1 - frac) * hps[bin0] + frac * hps[bin0 + 1];
  }
}
