import type { GroundTruthDataset, GroundTruthPitchFrame, GroundTruthNote } from './types';
import { noteToFrequency } from '../tonicDetector';

/**
 * Synthesizes an acoustic Sitar audio buffer with jawari upper harmonics,
 * sympathetic resonant strings, and decay envelopes matching real sitar acoustics.
 */
export function synthesizeSitarAudio(
  notes: GroundTruthNote[],
  sampleRate = 44100,
  includeJawariHarmonics = true,
  includeChikari = false
): { audioSamples: Float32Array; pitchTrack: GroundTruthPitchFrame[] } {
  const maxEndSec = notes.reduce((max, n) => Math.max(max, n.endTime), 0);
  const totalSamples = Math.ceil((maxEndSec + 0.3) * sampleRate);
  const samples = new Float32Array(totalSamples);

  const hopSec = 512 / sampleRate;
  const numFrames = Math.floor(maxEndSec / hopSec);
  const pitchTrack: GroundTruthPitchFrame[] = [];

  // Generate ground truth pitch track
  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    const activeNote = notes.find((n) => t >= n.startTime && t < n.endTime);
    if (activeNote) {
      if (activeNote.isOrnamenteed) {
        // Linear meend glide simulation
        const progress = (t - activeNote.startTime) / (activeNote.endTime - activeNote.startTime);
        pitchTrack.push({
          timestamp: t,
          frequency: activeNote.frequency * Math.pow(2, (progress * 2) / 12),
        });
      } else {
        pitchTrack.push({
          timestamp: t,
          frequency: activeNote.frequency,
        });
      }
    } else {
      pitchTrack.push({ timestamp: t, frequency: 0 });
    }
  }

  // Synthesize acoustic samples
  for (const note of notes) {
    const startSample = Math.floor(note.startTime * sampleRate);
    const endSample = Math.floor(note.endTime * sampleRate);
    const durSec = note.endTime - note.startTime;

    for (let i = startSample; i < endSample && i < totalSamples; i++) {
      const t = (i - startSample) / sampleRate;
      // Exponential pluck decay with initial sharp strike
      const attack = Math.min(1, t * 150);
      const decay = Math.exp(-t * 2.8);
      const env = attack * decay;

      let f = note.frequency;
      if (note.isOrnamenteed) {
        const progress = t / durSec;
        f = note.frequency * Math.pow(2, (progress * 2) / 12);
      }

      // Sitar acoustics: Fundamental + rich 2nd, 3rd, 4th jawari harmonics + sympathetic resonance
      let sample = 0.55 * Math.sin(2 * Math.PI * f * t);

      if (includeJawariHarmonics) {
        sample += 0.35 * Math.sin(2 * Math.PI * 2 * f * t);
        sample += 0.22 * Math.sin(2 * Math.PI * 3 * f * t);
        sample += 0.15 * Math.sin(2 * Math.PI * 4 * f * t);
        // Sympathetic buzz / bridge nonlinearity
        sample += 0.08 * Math.sin(2 * Math.PI * 1.5 * f * t) * Math.sin(2 * Math.PI * 0.5 * f * t);
      }

      samples[i] += env * sample * 0.8;
    }
  }

  // Optional chikari high-frequency rhythmic bursts (typical in sitar gat)
  if (includeChikari) {
    for (let i = 0; i < notes.length - 1; i++) {
      const chikariTime = notes[i].endTime - 0.15;
      const chStart = Math.floor(chikariTime * sampleRate);
      for (let j = 0; j < Math.floor(0.12 * sampleRate); j++) {
        const t = j / sampleRate;
        const env = Math.exp(-t * 40);
        // High drone strings tuned to Sa and Pa (taar saptak)
        const burst = 0.4 * Math.sin(2 * Math.PI * 1174.66 * t) + 0.3 * (Math.random() - 0.5);
        if (chStart + j < totalSamples) {
          samples[chStart + j] += burst * env * 0.3;
        }
      }
    }
  }

  // Normalize
  let maxAmp = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > maxAmp) maxAmp = Math.abs(samples[i]);
  }
  if (maxAmp > 0) {
    const scale = 0.9 / maxAmp;
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= scale;
    }
  }

  return { audioSamples: samples, pitchTrack };
}

/**
 * Benchmark Dataset 1: Standard Sitar Gat Composition in Tintal.
 * Sa = D4 (293.66 Hz).
 * Features typical sitar movements: G, G, R, S, N,, D,, P,, Mt,, P, etc.
 */
export function createSitarGatBenchmark(): GroundTruthDataset {
  const saPitch = 'D4';
  const saFreq = 293.66;

  const rawNotes: Omit<GroundTruthNote, 'frequency'>[] = [
    { startTime: 0.0, endTime: 0.6, swara: 'G', octave: 0 },
    { startTime: 0.6, endTime: 1.2, swara: 'G', octave: 0 },
    { startTime: 1.2, endTime: 1.8, swara: 'R', octave: 0 },
    { startTime: 1.8, endTime: 2.4, swara: 'S', octave: 0 },
    { startTime: 2.4, endTime: 3.0, swara: 'N', octave: -1 },
    { startTime: 3.0, endTime: 3.6, swara: 'D', octave: -1 },
    { startTime: 3.6, endTime: 4.2, swara: 'P', octave: -1 },
    { startTime: 4.2, endTime: 4.8, swara: 'Mt', octave: -1 },
    { startTime: 4.8, endTime: 5.4, swara: 'P', octave: -1 },
    { startTime: 5.4, endTime: 6.0, swara: 'S', octave: 0 },
  ];

  const swaraOffsets: Record<string, number> = {
    S: 0,
    r: 1,
    R: 2,
    g: 3,
    G: 4,
    m: 5,
    Mt: 6,
    P: 7,
    d: 8,
    D: 9,
    n: 10,
    N: 11,
  };

  const notes: GroundTruthNote[] = rawNotes.map((n) => {
    const semitones = swaraOffsets[n.swara] + n.octave * 12;
    const frequency = saFreq * Math.pow(2, semitones / 12);
    return { ...n, frequency };
  });

  const { audioSamples, pitchTrack } = synthesizeSitarAudio(notes, 44100, true, true);

  return {
    name: 'Sitar Gat Phrase (Tintal, Sa=D4, Rich Jawari + Chikari)',
    instrument: 'sitar',
    saPitch,
    saFrequency: saFreq,
    durationSeconds: 6.0,
    notes,
    pitchTrack,
    audioSamples,
    sampleRate: 44100,
  };
}

/**
 * Benchmark Dataset 2: Sitar Continuous Meend Glides (String Pulls).
 * Tests tracking continuous pitch without staircasing.
 */
export function createSitarMeendBenchmark(): GroundTruthDataset {
  const saPitch = 'D4';
  const saFreq = 293.66;

  // Meend from S (293.66) pulling up to G (369.99), holding, then pulling to P (440.0)
  const notes: GroundTruthNote[] = [
    {
      startTime: 0.0,
      endTime: 1.2,
      swara: 'S',
      octave: 0,
      frequency: saFreq,
      isOrnamenteed: true, // Meend pull
    },
    {
      startTime: 1.2,
      endTime: 2.4,
      swara: 'G',
      octave: 0,
      frequency: saFreq * Math.pow(2, 4 / 12),
      isOrnamenteed: true, // Meend pull to P
    },
    {
      startTime: 2.4,
      endTime: 3.6,
      swara: 'P',
      octave: 0,
      frequency: saFreq * Math.pow(2, 7 / 12),
      isOrnamenteed: false,
    },
  ];

  const { audioSamples, pitchTrack } = synthesizeSitarAudio(notes, 44100, true, false);

  return {
    name: 'Sitar Continuous Meend Glides (S -> G -> P)',
    instrument: 'sitar',
    saPitch,
    saFrequency: saFreq,
    durationSeconds: 3.6,
    notes,
    pitchTrack,
    audioSamples,
    sampleRate: 44100,
  };
}

/**
 * Parser for Saraga Hindustani pitch tracks (CSV) and note annotations.
 * Format of Saraga pitch tracks:
 * timestamp (s), frequency (Hz)
 */
export function parseSaragaPitchTrackCsv(csvContent: string): GroundTruthPitchFrame[] {
  const lines = csvContent.trim().split('\n');
  const frames: GroundTruthPitchFrame[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/[\s,]+/);
    if (parts.length >= 2) {
      const timestamp = parseFloat(parts[0]);
      const frequency = parseFloat(parts[1]);
      if (!isNaN(timestamp) && !isNaN(frequency)) {
        frames.push({ timestamp, frequency });
      }
    }
  }

  return frames;
}
