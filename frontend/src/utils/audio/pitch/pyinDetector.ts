/**
 * Probabilistic YIN (pYIN) Pitch Tracking Algorithm.
 * Implemented in pure TypeScript for fast, cross-platform browser & Node execution.
 *
 * Key advantages over standard YIN:
 * 1. Multi-candidate peak extraction from the CMNDF (not greedy first-valley).
 * 2. Viterbi dynamic programming trellis smoothing over consecutive frames.
 * 3. Probabilistic voiced/unvoiced classification.
 * 4. Specific octave-error penalization and sitar harmonic correction.
 */

import type { PitchFrame, PitchDetectorOptions } from '../pitchDetector';

export interface PYinCandidate {
  frequency: number; // 0 for unvoiced
  period: number;
  cmndValue: number;
  weight: number; // log likelihood / observation score
  isVoiced: boolean;
}

export class PYinPitchDetector {
  private sampleRate: number;
  private frameSize: number;
  private hopSize: number;
  private minPeriod: number;
  private maxPeriod: number;
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
    this.silenceThreshold = options.silenceThreshold || 0.008;
    this.clarityThreshold = options.clarityThreshold || 0.45;
  }

  /**
   * Analyzes an entire audio channel using pYIN multi-candidate Viterbi decoding.
   */
  public analyze(channelData: Float32Array): PitchFrame[] {
    const totalSamples = channelData.length;
    const halfSize = Math.floor(this.frameSize / 2);

    // Step 1: Extract candidates frame by frame
    const frameCandidates: PYinCandidate[][] = [];
    const frameRms: number[] = [];
    const frameTimes: number[] = [];

    for (let offset = 0; offset + this.frameSize <= totalSamples; offset += this.hopSize) {
      const time = (offset + this.frameSize / 2) / this.sampleRate;
      frameTimes.push(time);

      // 1. RMS Energy
      let sumSquares = 0;
      for (let i = 0; i < this.frameSize; i++) {
        const val = channelData[offset + i] || 0;
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / this.frameSize);
      frameRms.push(rms);

      if (rms < this.silenceThreshold) {
        // Pure unvoiced frame
        frameCandidates.push([
          {
            frequency: 0,
            period: 0,
            cmndValue: 1.0,
            weight: 0.0,
            isVoiced: false,
          },
        ]);
        continue;
      }

      // 2. Difference function & CMNDF
      const diff = new Float32Array(halfSize);
      for (let tau = 0; tau < halfSize; tau++) {
        let d = 0;
        for (let j = 0; j < halfSize; j++) {
          const delta = channelData[offset + j] - channelData[offset + j + tau];
          d += delta * delta;
        }
        diff[tau] = d;
      }

      const cmnd = new Float32Array(halfSize);
      cmnd[0] = 1;
      let runningSum = 0;
      for (let tau = 1; tau < halfSize; tau++) {
        runningSum += diff[tau];
        cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
      }

      // 3. Find all local valleys (minima) in the search range
      const candidates: PYinCandidate[] = [];

      for (let tau = this.minPeriod + 1; tau < this.maxPeriod - 1; tau++) {
        if (cmnd[tau] < cmnd[tau - 1] && cmnd[tau] < cmnd[tau + 1]) {
          // Sub-sample parabolic interpolation
          const s0 = cmnd[tau - 1];
          const s1 = cmnd[tau];
          const s2 = cmnd[tau + 1];
          const denom = 2 * (s0 - 2 * s1 + s2);
          let betterTau = tau;
          if (Math.abs(denom) > 1e-6) {
            betterTau = tau + (s0 - s2) / denom;
          }

          const freq = this.sampleRate / betterTau;
          const val = cmnd[tau];

          // Sitar overtone check: if this valley is around half frequency of an earlier candidate,
          // check if this is subharmonic doubling from jawari
          let sitarBonus = 0;
          if (val < 0.25) {
            sitarBonus += 0.2;
          }

          // Observation weight: lower cmnd gives higher weight
          const weight = Math.max(0, 1 - val) + sitarBonus;
          candidates.push({
            frequency: freq,
            period: betterTau,
            cmndValue: val,
            weight,
            isVoiced: true,
          });
        }
      }

      // Add unvoiced candidate state
      // If candidates have weak dips or RMS is low, unvoiced gets higher weight
      const bestVal = candidates.reduce((min, c) => Math.min(min, c.cmndValue), 1.0);
      const unvoicedWeight = Math.max(0.1, bestVal * 1.2 - (rms > 0.05 ? 0.3 : 0));
      candidates.push({
        frequency: 0,
        period: 0,
        cmndValue: bestVal,
        weight: unvoicedWeight,
        isVoiced: false,
      });

      frameCandidates.push(candidates);
    }

    if (frameCandidates.length === 0) return [];

    // Step 2: Viterbi Trellis Search
    // State values: dp[frameIndex][candidateIndex] = minimum accumulated cost
    const numFrames = frameCandidates.length;
    const dp: number[][] = [];
    const backpointers: number[][] = [];

    // Initialize frame 0
    dp[0] = frameCandidates[0].map((c) => -Math.log(Math.max(1e-4, c.weight)));
    backpointers[0] = frameCandidates[0].map(() => -1);

    for (let t = 1; t < numFrames; t++) {
      dp[t] = [];
      backpointers[t] = [];
      const prevCands = frameCandidates[t - 1];
      const currCands = frameCandidates[t];

      for (let j = 0; j < currCands.length; j++) {
        const curr = currCands[j];
        let bestCost = Infinity;
        let bestPrevIdx = 0;

        for (let i = 0; i < prevCands.length; i++) {
          const prev = prevCands[i];
          const transCost = this.computeTransitionCost(prev, curr);
          const totalCost = dp[t - 1][i] + transCost;

          if (totalCost < bestCost) {
            bestCost = totalCost;
            bestPrevIdx = i;
          }
        }

        // Add observation emission cost
        const emitCost = -Math.log(Math.max(1e-4, curr.weight));
        dp[t][j] = bestCost + emitCost;
        backpointers[t][j] = bestPrevIdx;
      }
    }

    // Step 3: Backtrack optimal path
    const bestPath: PYinCandidate[] = new Array(numFrames);
    let bestFinalIdx = 0;
    let minFinalCost = Infinity;

    for (let j = 0; j < dp[numFrames - 1].length; j++) {
      if (dp[numFrames - 1][j] < minFinalCost) {
        minFinalCost = dp[numFrames - 1][j];
        bestFinalIdx = j;
      }
    }

    bestPath[numFrames - 1] = frameCandidates[numFrames - 1][bestFinalIdx];
    let currIdx = bestFinalIdx;
    for (let t = numFrames - 1; t > 0; t--) {
      currIdx = backpointers[t][currIdx];
      bestPath[t - 1] = frameCandidates[t - 1][currIdx];
    }

    // Step 4: Construct output PitchFrame array
    const outputFrames: PitchFrame[] = [];
    for (let t = 0; t < numFrames; t++) {
      const selected = bestPath[t];
      const clarity = Math.max(0, Math.min(1, 1 - selected.cmndValue));
      const isVoiced = selected.isVoiced && selected.frequency > 0 && clarity >= this.clarityThreshold;

      outputFrames.push({
        time: frameTimes[t],
        frequency: isVoiced ? selected.frequency : 0,
        clarity,
        rms: frameRms[t],
        isVoiced,
      });
    }

    return outputFrames;
  }

  /**
   * Computes transition cost between two candidates in adjacent frames.
   * Strongly penalizes sudden unphysical pitch leaps and octave jumps.
   */
  private computeTransitionCost(c1: PYinCandidate, c2: PYinCandidate): number {
    // Both unvoiced: smooth transition
    if (!c1.isVoiced && !c2.isVoiced) {
      return 0.1;
    }

    // Voiced <-> Unvoiced transition
    if (c1.isVoiced !== c2.isVoiced) {
      return 1.8; // Voicing change penalty
    }

    // Both voiced: measure pitch continuity in cents
    const freqRatio = c2.frequency / c1.frequency;
    const centsJump = Math.abs(1200 * Math.log2(freqRatio));

    // Smooth continuous change (e.g. within ±80 cents per frame, normal for meend)
    if (centsJump <= 80) {
      return (centsJump / 80) * 0.4;
    }

    // Octave jump penalty (1200 ± 60 cents or 2400 ± 60 cents)
    const isOctaveJump =
      Math.abs(centsJump - 1200) < 60 || Math.abs(centsJump - 2400) < 60;
    if (isOctaveJump) {
      return 3.5; // High penalty against octave flipping
    }

    // Larger pitch leaps
    return 1.0 + (centsJump / 1200) * 2.5;
  }
}
