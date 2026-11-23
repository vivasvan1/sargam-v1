/**
 * Probabilistic YIN (pYIN) Pitch Tracking Algorithm with Harmonic Product Spectrum (HPS) Fusion.
 * Implemented in pure TypeScript for fast, cross-platform browser & Node execution.
 *
 * SOTA Enhancements:
 * 1. Multi-candidate CMNDF peak extraction with sub-sample parabolic refinement.
 * 2. Harmonic Product Spectrum (HPS) cross-validation: suppresses subharmonics & octave doubling.
 * 3. Intelligent Tanpura Drone Suppression: rejects static background drone harmonics during pauses.
 * 4. Bayesian voiced/unvoiced likelihood modeling with energy and spectral clarity scaling.
 * 5. Viterbi dynamic programming trellis decoding with Indian music glide (meend) tolerance.
 * 6. Hysteresis post-filtering for continuous phrasing without dropout flutter.
 */

import type { PitchFrame, PitchDetectorOptions } from '../pitchDetector';
import { FastFFT } from './fastFft';

export interface PYinCandidate {
  frequency: number; // 0 for unvoiced
  period: number;
  cmndValue: number;
  hpsScore: number;
  weight: number; // posterior score / emission weight
  isVoiced: boolean;
}

export class PYinPitchDetector {
  private sampleRate: number;
  private frameSize: number;
  private hopSize: number;
  private minFreq: number;
  private maxFreq: number;
  private minPeriod: number;
  private maxPeriod: number;
  private silenceThreshold: number;
  private clarityThreshold: number;
  private saFrequency?: number;
  private suppressDrone: boolean;
  private fft: FastFFT;

  constructor(options: PitchDetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.frameSize = options.frameSize || 2048;
    this.hopSize = options.hopSize || 512;
    this.minFreq = options.minFrequency || 75;
    this.maxFreq = options.maxFrequency || 1200;
    this.minPeriod = Math.max(2, Math.floor(this.sampleRate / this.maxFreq));
    this.maxPeriod = Math.min(
      Math.floor(this.frameSize / 2),
      Math.floor(this.sampleRate / this.minFreq)
    );
    this.silenceThreshold = options.silenceThreshold || 0.007;
    this.clarityThreshold = options.clarityThreshold || 0.45;
    this.saFrequency = options.saFrequency;
    this.suppressDrone = options.suppressDrone ?? true;
    this.fft = new FastFFT(this.frameSize);
  }

  /**
   * Analyzes an entire audio channel using pYIN + HPS multi-candidate Viterbi decoding.
   */
  public analyze(channelData: Float32Array): PitchFrame[] {
    const totalSamples = channelData.length;
    const halfSize = Math.floor(this.frameSize / 2);

    // Step 1: Extract candidates frame by frame
    const frameCandidates: PYinCandidate[][] = [];
    const frameRms: number[] = [];
    const frameTimes: number[] = [];

    // Pre-calculate drone frequencies if Sa is known
    const droneFrequencies: number[] = [];
    if (this.suppressDrone && this.saFrequency && this.saFrequency > 40) {
      const sa = this.saFrequency;
      droneFrequencies.push(sa, sa * 0.5, sa * 2.0); // Sa octaves
      droneFrequencies.push(sa * 1.5, sa * 0.75); // Pa (fifth)
      droneFrequencies.push(sa * (4 / 3), sa * (2 / 3)); // Ma (fourth, e.g. Marwa/Bhairav)
    }

    // Measure baseline minimum energy across early frames to calibrate tanpura noise floor
    let noiseFloorRms = 0.015;
    let initialCount = 0;
    for (
      let off = 0;
      off + this.frameSize <= totalSamples && initialCount < 30;
      off += this.hopSize, initialCount++
    ) {
      let sumSq = 0;
      for (let i = 0; i < this.frameSize; i++) {
        const v = channelData[off + i] || 0;
        sumSq += v * v;
      }
      const r = Math.sqrt(sumSq / this.frameSize);
      if (r < noiseFloorRms) noiseFloorRms = Math.max(0.003, r);
    }

    const frameBuffer = new Float32Array(this.frameSize);

    for (let offset = 0; offset + this.frameSize <= totalSamples; offset += this.hopSize) {
      const time = (offset + this.frameSize / 2) / this.sampleRate;
      frameTimes.push(time);

      // 1. RMS Energy
      let sumSquares = 0;
      for (let i = 0; i < this.frameSize; i++) {
        const val = channelData[offset + i] || 0;
        frameBuffer[i] = val;
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
            hpsScore: 0.0,
            weight: 0.0,
            isVoiced: false,
          },
        ]);
        continue;
      }

      // 2. Frequency-domain analysis: FastFFT & HPS
      const magSpectrum = this.fft.computeMagnitude(frameBuffer);
      const hps = this.fft.computeHPS(magSpectrum, 4);

      let maxHps = 1e-6;
      const minBin = Math.floor((this.minFreq * this.frameSize) / this.sampleRate);
      const maxBin = Math.min(hps.length - 1, Math.ceil((this.maxFreq * this.frameSize) / this.sampleRate));
      for (let k = minBin; k <= maxBin; k++) {
        if (hps[k] > maxHps) maxHps = hps[k];
      }

      // 3. Difference function & CMNDF (bounded to maxPeriod)
      const maxTau = Math.min(halfSize, this.maxPeriod + 2);
      const diff = new Float32Array(maxTau);
      for (let tau = 0; tau < maxTau; tau++) {
        let d = 0;
        const oTau = offset + tau;
        for (let j = 0; j < halfSize; j++) {
          const delta = channelData[offset + j] - channelData[oTau + j];
          d += delta * delta;
        }
        diff[tau] = d;
      }

      const cmnd = new Float32Array(maxTau);
      cmnd[0] = 1;
      let runningSum = 0;
      for (let tau = 1; tau < maxTau; tau++) {
        runningSum += diff[tau];
        cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
      }

      // 4. Extract candidate dips in CMNDF with sub-sample parabolic interpolation
      interface LocalDip {
        tau: number;
        betterTau: number;
        val: number;
        freq: number;
        hpsRel: number;
      }
      const dips: LocalDip[] = [];

      for (let tau = this.minPeriod + 1; tau < this.maxPeriod - 1; tau++) {
        if (cmnd[tau] < cmnd[tau - 1] && cmnd[tau] < cmnd[tau + 1] && cmnd[tau] < 0.65) {
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
          const hpsScore = this.fft.getHpsScore(hps, freq, this.sampleRate);
          const hpsRel = maxHps > 0 ? hpsScore / maxHps : 0;

          dips.push({ tau, betterTau, val: cmnd[tau], freq, hpsRel });
        }
      }

      const candidates: PYinCandidate[] = [];
      const THRESHOLDS = [0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30, 0.35, 0.42];
      const votes = new Map<number, number>();

      for (const th of THRESHOLDS) {
        let chosen = dips.find((d) => d.val < th);
        if (chosen) {
          // Subharmonic and octave verification using HPS:
          // If chosen.tau has an equivalent dip near tau/2 or tau/4 with strong HPS energy,
          // prefer the higher fundamental frequency (shorter period) to suppress subharmonics
          const halfTau = Math.round(chosen.tau / 2);
          const quarterTau = Math.round(chosen.tau / 4);
          const subDip = dips.find(
            (d) =>
              (Math.abs(d.tau - halfTau) <= 3 && (d.val < 0.38 || d.hpsRel > chosen.hpsRel * 1.5)) ||
              (Math.abs(d.tau - quarterTau) <= 3 && (d.val < 0.38 || d.hpsRel > chosen.hpsRel * 1.5))
          );
          if (subDip && subDip.hpsRel >= 0.2) {
            chosen = subDip;
          }
          votes.set(chosen.tau, (votes.get(chosen.tau) || 0) + 1);
        }
      }

      // Also ensure the global minimum dip and global HPS peak are represented
      let globalMinDip: LocalDip | null = null;
      for (const d of dips) {
        if (!globalMinDip || d.val < globalMinDip.val) {
          globalMinDip = d;
        }
      }
      if (globalMinDip) {
        const halfTau = Math.round(globalMinDip.tau / 2);
        const subDip = dips.find(
          (d) => Math.abs(d.tau - halfTau) <= 3 && (d.val < 0.38 || d.hpsRel > globalMinDip!.hpsRel * 1.5)
        );
        const effectiveDip = subDip && subDip.hpsRel >= 0.2 ? subDip : globalMinDip;
        if (!votes.has(effectiveDip.tau)) {
          votes.set(effectiveDip.tau, 1);
        }
      }

      for (const [dipTau, count] of votes.entries()) {
        const dip = dips.find((d) => d.tau === dipTau)!;
        // Joint likelihood: CMND depth + HPS spectral agreement
        const hpsBonus = 0.5 + 0.5 * dip.hpsRel;
        const weight = (count / THRESHOLDS.length) * (1 - dip.val) * hpsBonus;
        candidates.push({
          frequency: dip.freq,
          period: dip.betterTau,
          cmndValue: dip.val,
          hpsScore: dip.hpsRel,
          weight: Math.max(1e-4, weight),
          isVoiced: true,
        });
      }

      // Beam Search Pruning: Retain top 3 most probable voiced candidates per frame
      candidates.sort((a, b) => b.weight - a.weight);
      const topCandidates = candidates.slice(0, 3);

      // 5. Intelligent Tanpura Drone Suppression
      let isDroneBleed = false;
      if (droneFrequencies.length > 0 && topCandidates.length > 0) {
        const bestFreq = topCandidates[0].frequency;
        for (const droneF of droneFrequencies) {
          const centsDiff = Math.abs(1200 * Math.log2(bestFreq / droneF));
          // If candidate perfectly matches a static tanpura drone string (within 28 cents)
          // and frame energy is near or below the background drone floor, it is drone bleed!
          if (centsDiff <= 28 && rms <= noiseFloorRms * 1.8) {
            isDroneBleed = true;
            break;
          }
        }
      }

      // 6. Bayesian Voicing Probability Formulation
      const bestVal = topCandidates.length > 0 ? topCandidates[0].cmndValue : 1.0;
      const bestHps = topCandidates.length > 0 ? topCandidates[0].hpsScore : 0.0;

      let pVoiced: number;
      if (isDroneBleed) {
        // De-bias drone bleed during vocal pauses
        pVoiced = 0.02;
      } else {
        const clarityScore = (1.0 - bestVal) * (0.6 + 0.4 * bestHps);
        const energyScaling = rms > 0.012 ? 1.0 : rms / 0.012;
        pVoiced = Math.max(0.01, Math.min(0.99, clarityScore * energyScaling));
      }
      const pUnvoiced = 1.0 - pVoiced;

      const sumVoicedWeights = topCandidates.reduce((s, c) => s + c.weight, 0);
      for (const c of topCandidates) {
        c.weight = sumVoicedWeights > 0 ? pVoiced * (c.weight / sumVoicedWeights) : pVoiced / topCandidates.length;
      }

      topCandidates.push({
        frequency: 0,
        period: 0,
        cmndValue: bestVal,
        hpsScore: 0.0,
        weight: pUnvoiced,
        isVoiced: false,
      });

      frameCandidates.push(topCandidates);
    }

    if (frameCandidates.length === 0) return [];

    // Step 2: Viterbi Trellis Search
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

    // Step 4: Construct initial output PitchFrame array
    const rawFrames: PitchFrame[] = [];
    for (let t = 0; t < numFrames; t++) {
      const selected = bestPath[t];
      const clarity = Math.max(0, Math.min(1, 1 - selected.cmndValue));
      const isVoiced = selected.isVoiced && selected.frequency > 0 && clarity >= this.clarityThreshold;

      rawFrames.push({
        time: frameTimes[t],
        frequency: isVoiced ? selected.frequency : 0,
        clarity,
        rms: frameRms[t],
        isVoiced,
      });
    }

    // Step 5: Voicing Hysteresis
    const outputFrames: PitchFrame[] = rawFrames.map((f) => ({ ...f }));
    for (let t = 1; t < numFrames - 1; t++) {
      const prev = rawFrames[t - 1];
      const curr = rawFrames[t];
      const next = rawFrames[t + 1];

      // Remove isolated 1-frame voiced noise spike
      if (!prev.isVoiced && curr.isVoiced && !next.isVoiced) {
        outputFrames[t].isVoiced = false;
        outputFrames[t].frequency = 0;
      }
      // Fill isolated 1-frame dropout in continuous singing
      else if (prev.isVoiced && !curr.isVoiced && next.isVoiced) {
        const centsBetween = Math.abs(1200 * Math.log2(next.frequency / prev.frequency));
        if (centsBetween < 160) {
          outputFrames[t].isVoiced = true;
          outputFrames[t].frequency = (prev.frequency + next.frequency) / 2;
          outputFrames[t].clarity = (prev.clarity + next.clarity) / 2;
        }
      }
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
      return 0.05;
    }

    // Voiced <-> Unvoiced transition
    if (c1.isVoiced !== c2.isVoiced) {
      return 1.6; // Voicing change penalty
    }

    // Both voiced: measure pitch continuity in cents
    const freqRatio = c2.frequency / c1.frequency;
    const centsJump = Math.abs(1200 * Math.log2(freqRatio));

    // Smooth continuous change (e.g. within ±80 cents per frame, normal for meend)
    if (centsJump <= 80) {
      return (centsJump / 80) * 0.35;
    }

    // Octave jump penalty (1200 ± 60 cents or 2400 ± 60 cents)
    const isOctaveJump =
      Math.abs(centsJump - 1200) < 60 || Math.abs(centsJump - 2400) < 60;
    if (isOctaveJump) {
      return 4.5; // High penalty against octave flipping
    }

    // Larger pitch leaps
    return 0.9 + (centsJump / 1200) * 2.8;
  }
}
