/**
 * Indian Classical Music Tonic (Sa) Detector.
 * Computes Pitch Class Profile (PCP / Chromagram) from audio and correlates
 * with Hindustani/Carnatic drone harmonic templates (Sa-Pa and Sa-Ma profiles).
 */

export interface DetectedSa {
  note: string; // e.g. "C#"
  octave: number; // e.g. 4
  pitch: string; // e.g. "C#4"
  frequency: number; // Hz, e.g. 277.18
  centsOffset: number; // tuning deviation from A440, in cents (-50 to +50)
  confidence: number; // 0 to 1
  chroma: number[]; // 12-bin normalized pitch class profile [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
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
 * Detects the most probable Indian Classical Sa (Tonic) from an AudioBuffer or Float32Array.
 */
export function detectSaFromAudio(
  channelData: Float32Array,
  sampleRate: number
): DetectedSa {
  const { chroma, dominantFrequencies } = computeChromagram(channelData, sampleRate);

  // Score candidate pitch classes against Indian Classical drone profile:
  // Sa (1.0), Pa (Sa + 7, 0.75), Ma (Sa + 5, 0.35)
  let bestPitchClass = 0; // Default C
  let highestScore = -1;
  const scores = new Float64Array(12);

  for (let sa = 0; sa < 12; sa++) {
    const pa = (sa + 7) % 12;
    const ma = (sa + 5) % 12;
    // Score combines Sa prominence with fifth (Pa) or fourth (Ma) harmonic reinforcement
    const score = chroma[sa] * 1.0 + chroma[pa] * 0.75 + chroma[ma] * 0.3;
    scores[sa] = score;

    if (score > highestScore) {
      highestScore = score;
      bestPitchClass = sa;
    }
  }

  // Determine dominant octave (usually 3 or 4 for Hindustani/Carnatic Sa)
  // Check dominant frequencies that map to bestPitchClass
  let octave = 4; // default C4/D4 range (female / harmonium standard)
  const candidateOctaves: Record<number, number> = { 3: 0, 4: 0, 5: 0 };

  dominantFrequencies.forEach((freq) => {
    const { note, octave: oct } = frequencyToNote(freq);
    if (note === NOTE_NAMES[bestPitchClass] && (oct === 3 || oct === 4 || oct === 5)) {
      candidateOctaves[oct] = (candidateOctaves[oct] || 0) + 1;
    }
  });

  if (candidateOctaves[3] > candidateOctaves[4]) {
    octave = 3; // male vocal / sitar kharaj range
  } else {
    octave = 4;
  }

  // Calculate confidence based on difference between top score and runner-up
  const sortedScores = [...scores].sort((a, b) => b - a);
  const runnerUp = sortedScores[1] || 0;
  const confidence =
    sortedScores[0] > 0
      ? Math.min(0.98, Math.max(0.4, (sortedScores[0] - runnerUp) / sortedScores[0] + 0.3))
      : 0.5;

  const note = NOTE_NAMES[bestPitchClass];
  const standardFreq = noteToFrequency(note, octave, 0);

  return {
    note,
    octave,
    pitch: `${note}${octave}`,
    frequency: Math.round(standardFreq * 100) / 100,
    centsOffset: 0,
    confidence: Math.round(confidence * 100) / 100,
    chroma,
  };
}
