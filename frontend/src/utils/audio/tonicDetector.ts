/**
 * Indian Classical Music Tonic (Sa) Detector.
 * Computes Pitch Class Profile (PCP / Chromagram) from audio and correlates
 * with Hindustani/Carnatic drone harmonic templates (Sa-Pa and Sa-Ma profiles).
 */

export interface SaCandidate {
  note: string; // e.g. "D"
  octave: number; // e.g. 4
  pitch: string; // e.g. "D4"
  frequency: number; // Hz, e.g. 293.66
  centsOffset: number; // tuning deviation from A440, in cents (-50 to +50)
  confidence: number; // 0 to 1
  score: number;
  reason: string; // e.g. "Primary Tonic", "5th (Pa) Harmonic Ambiguity"
}

export interface DetectedSa {
  note: string; // e.g. "C#"
  octave: number; // e.g. 4
  pitch: string; // e.g. "C#4"
  frequency: number; // Hz, e.g. 277.18
  centsOffset: number; // tuning deviation from A440, in cents (-50 to +50)
  confidence: number; // 0 to 1
  chroma: number[]; // 12-bin normalized pitch class profile [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
  candidates: SaCandidate[]; // Ranked top candidate tonics
}

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/**
 * Standard frequency for a note and octave at A440 tuning.
 */
export function noteToFrequency(note: string, octave: number, centsOffset = 0): number {
  const noteIdx = NOTE_NAMES.indexOf(note as any);
  if (noteIdx === -1) return 261.63; // Fallback C4
  // MIDI note: C4 is 60, A4 is 69
  const midi = 12 * (octave + 1) + noteIdx;
  const standardFreq = 440 * Math.pow(2, (midi - 69) / 12);
  if (centsOffset === 0) return standardFreq;
  return standardFreq * Math.pow(2, centsOffset / 1200);
}

/**
 * Converts frequency (Hz) to nearest note, octave, and cents offset.
 */
export function frequencyToNote(freq: number): {
  note: string;
  octave: number;
  pitch: string;
  centsOffset: number;
} {
  if (freq <= 0) return { note: 'C', octave: 4, pitch: 'C4', centsOffset: 0 };
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midiRound = Math.round(midiFloat);
  const centsOffset = Math.round((midiFloat - midiRound) * 100);

  const noteIdx = ((midiRound % 12) + 12) % 12;
  const octave = Math.floor(midiRound / 12) - 1;
  const note = NOTE_NAMES[noteIdx];
  return {
    note,
    octave,
    pitch: `${note}${octave}`,
    centsOffset,
  };
}

/**
 * Computes a 12-dimensional Chromagram from audio samples.
 */
export function computeChromagram(
  samples: Float32Array,
  sampleRate: number
): { chroma: number[]; dominantFrequencies: number[] } {
  const chroma = new Float64Array(12);
  const dominantFreqBins: { freq: number; mag: number }[] = [];

  // Frame settings: 4096 samples (~93ms at 44.1kHz), hop 2048
  const frameSize = 4096;
  const hopSize = 2048;
  const totalFrames = Math.floor((samples.length - frameSize) / hopSize);

  if (totalFrames <= 0) {
    return { chroma: Array.from(chroma), dominantFrequencies: [] };
  }

  // Precompute Hann window
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  // Range of analysis: 65 Hz (C2) to 1100 Hz (C#6)
  const minBin = Math.max(1, Math.floor((65 * frameSize) / sampleRate));
  const maxBin = Math.min(
    Math.floor(frameSize / 2),
    Math.ceil((1100 * frameSize) / sampleRate)
  );

  // We perform STFT across audio (limiting to max 60 frames for responsiveness)
  const frameStep = Math.max(1, Math.floor(totalFrames / 60));

  for (let f = 0; f < totalFrames; f += frameStep) {
    const offset = f * hopSize;
    // Windowed signal
    const real = new Float64Array(frameSize);
    const imag = new Float64Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      real[i] = (samples[offset + i] || 0) * window[i];
    }

    // Direct computation of bins between minBin and maxBin
    for (let k = minBin; k <= maxBin; k++) {
      let r = 0;
      let im = 0;
      const angleStep = (-2 * Math.PI * k) / frameSize;
      // Stride for speed
      for (let n = 0; n < frameSize; n += 2) {
        const a = angleStep * n;
        r += real[n] * Math.cos(a);
        im += real[n] * Math.sin(a);
      }
      const magnitude = Math.sqrt(r * r + im * im);
      const freq = (k * sampleRate) / frameSize;

      if (magnitude > 1e-4) {
        // Map frequency to pitch class
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
        chroma[pitchClass] += magnitude;

        dominantFreqBins.push({ freq, mag: magnitude });
      }
    }
  }

  // Normalize chromagram
  let maxChroma = 0;
  for (let i = 0; i < 12; i++) {
    if (chroma[i] > maxChroma) maxChroma = chroma[i];
  }
  const normalizedChroma: number[] = [];
  for (let i = 0; i < 12; i++) {
    normalizedChroma.push(maxChroma > 0 ? chroma[i] / maxChroma : 0);
  }

  // Sort dominant frequencies
  dominantFreqBins.sort((a, b) => b.mag - a.mag);
  const topFrequencies = dominantFreqBins.slice(0, 10).map((item) => item.freq);

  return { chroma: normalizedChroma, dominantFrequencies: topFrequencies };
}

/**
 * Detects the most probable Indian Classical Sa (Tonic) and ranks top candidates
 * from an AudioBuffer or Float32Array.
 */
export function detectSaFromAudio(
  channelData: Float32Array,
  sampleRate: number
): DetectedSa {
  const { chroma, dominantFrequencies } = computeChromagram(channelData, sampleRate);

  // Score all 12 candidate pitch classes against Indian Classical drone profile:
  // Sa (1.0), Pa (Sa + 7, 0.75), Ma (Sa + 5, 0.35)
  const candidateScores: {
    pitchClass: number;
    score: number;
  }[] = [];

  for (let sa = 0; sa < 12; sa++) {
    const pa = (sa + 7) % 12;
    const ma = (sa + 5) % 12;
    const score = chroma[sa] * 1.0 + chroma[pa] * 0.75 + chroma[ma] * 0.3;
    candidateScores.push({ pitchClass: sa, score });
  }

  // Sort candidate pitch classes by score descending
  candidateScores.sort((a, b) => b.score - a.score);

  const maxScore = candidateScores[0]?.score || 1;
  const bestPitchClass = candidateScores[0]?.pitchClass ?? 2; // Default D

  // Build candidate objects for top 4
  const candidates: SaCandidate[] = candidateScores.slice(0, 4).map((cand, rank) => {
    const pc = cand.pitchClass;
    const note = NOTE_NAMES[pc];

    // Determine octave based on dominant frequencies matching this pitch class
    const matchingFreqs: { freq: number; oct: number; cents: number }[] = [];
    dominantFrequencies.forEach((freq) => {
      const info = frequencyToNote(freq);
      if (info.note === note && (info.octave === 3 || info.octave === 4 || info.octave === 5)) {
        matchingFreqs.push({ freq, oct: info.octave, cents: info.centsOffset });
      }
    });

    const oct3Count = matchingFreqs.filter((m) => m.oct === 3).length;
    const oct4Count = matchingFreqs.filter((m) => m.oct === 4).length;
    const octave = oct3Count > oct4Count ? 3 : 4;

    // Estimate fine tuning cents offset from dominant peak
    let centsOffset = 0;
    if (matchingFreqs.length > 0) {
      centsOffset = matchingFreqs[0].cents;
    }

    const freq = noteToFrequency(note, octave, centsOffset);
    const confidence = Math.max(0.2, Math.min(0.98, cand.score / (maxScore || 1)));

    // Categorize reason
    let reason = 'Candidate Tonic';
    if (rank === 0) {
      reason = 'Primary Tonic (Highest Drone Correlation)';
    } else if (pc === (bestPitchClass + 7) % 12) {
      reason = '5th (Pa) Harmonic Ambiguity';
    } else if (pc === (bestPitchClass + 5) % 12) {
      reason = '4th (Ma) Harmonic Ambiguity';
    } else if (pc === (bestPitchClass + 12 - 7) % 12) {
      reason = 'Sub-dominant (Mandra Pa) Match';
    }

    return {
      note,
      octave,
      pitch: `${note}${octave}`,
      frequency: Math.round(freq * 100) / 100,
      centsOffset,
      confidence: Math.round(confidence * 100) / 100,
      score: Math.round(cand.score * 100) / 100,
      reason,
    };
  });

  const bestCandidate = candidates[0];

  return {
    note: bestCandidate.note,
    octave: bestCandidate.octave,
    pitch: bestCandidate.pitch,
    frequency: bestCandidate.frequency,
    centsOffset: bestCandidate.centsOffset,
    confidence: bestCandidate.confidence,
    chroma,
    candidates,
  };
}
