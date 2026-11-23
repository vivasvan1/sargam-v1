import * as fs from 'fs';
import * as path from 'path';
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

/**
 * Reads a standard RIFF/WAVE file (IEEE Float or 16-bit PCM) into a mono Float32Array.
 */
export function loadWavFile(filePath: string): { samples: Float32Array; sampleRate: number } {
  const buffer = fs.readFileSync(filePath);

  // Validate RIFF header
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Invalid WAV file: ${filePath}`);
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset);
      numChannels = buffer.readUInt16LE(offset + 2);
      sampleRate = buffer.readUInt32LE(offset + 4);
      bitsPerSample = buffer.readUInt16LE(offset + 14);
    } else if (chunkId === 'data') {
      dataOffset = offset;
      dataSize = chunkSize;
      break;
    }
    offset += chunkSize;
  }

  if (dataOffset === -1) {
    throw new Error(`No data chunk found in WAV file: ${filePath}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(dataSize / (numChannels * bytesPerSample));
  const monoSamples = new Float32Array(numFrames);

  if (audioFormat === 3) {
    // IEEE Float 32-bit
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const bytePos = dataOffset + (i * numChannels + ch) * 4;
        sum += buffer.readFloatLE(bytePos);
      }
      monoSamples[i] = sum / numChannels;
    }
  } else if (audioFormat === 1) {
    // PCM 16-bit
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const bytePos = dataOffset + (i * numChannels + ch) * 2;
        sum += buffer.readInt16LE(bytePos) / 32768.0;
      }
      monoSamples[i] = sum / numChannels;
    }
  } else {
    throw new Error(`Unsupported WAV audio format ${audioFormat}`);
  }

  return { samples: monoSamples, sampleRate };
}

/**
 * Benchmark Dataset 3: Authentic Acoustic Sitar Pluck Recording (sitar_D4_long.wav).
 * Sa = D4 (293.66 Hz).
 * Real recording displaying authentic jawari bridge resonance, subtle vibrato, and natural string decay.
 */
export function createRealSitarBenchmark(wavPath?: string): GroundTruthDataset {
  const saPitch = 'D4';
  const saFreq = 293.66;
  const resolvedPath = wavPath || path.resolve(__dirname, 'sitar_D4_long.wav');

  const { samples, sampleRate } = loadWavFile(resolvedPath);
  const durationSec = samples.length / sampleRate;

  // Ground truth: 1 sustained note S (D4) starting at ~0.02s pluck onset, decaying until tail
  const notes: GroundTruthNote[] = [
    {
      startTime: 0.05,
      endTime: Math.min(2.8, durationSec),
      swara: 'S',
      octave: 0,
      frequency: saFreq,
      isOrnamenteed: false,
    },
  ];

  const hopSec = 512 / sampleRate;
  const numFrames = Math.floor(durationSec / hopSec);
  const pitchTrack: GroundTruthPitchFrame[] = [];

  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    if (t >= 0.05 && t <= 2.8) {
      pitchTrack.push({ timestamp: t, frequency: saFreq });
    } else {
      pitchTrack.push({ timestamp: t, frequency: 0 });
    }
  }

  return {
    name: 'Real Acoustic Sitar Recording (D4 Sustained Pluck, 44.1kHz)',
    instrument: 'sitar',
    saPitch,
    saFrequency: saFreq,
    durationSeconds: durationSec,
    notes,
    pitchTrack,
    audioSamples: samples,
    sampleRate,
  };
}

/**
 * Benchmark Dataset 4: Real performance from the Saraga Hindustani dataset.
 * Reads .ctonic.txt, .pitch.txt, and converts .mp3.mp3 to mono Float32 audio samples.
 */
export function loadSaragaBenchmark(
  ragaDir: string,
  trackName: string,
  maxDurationSec = 60
): GroundTruthDataset {
  const ctonicPath = path.join(ragaDir, `${trackName}.ctonic.txt`);
  const pitchPath = path.join(ragaDir, `${trackName}.pitch.txt`);
  const mp3Path = path.join(ragaDir, `${trackName}.mp3.mp3`);

  if (!fs.existsSync(ctonicPath) || !fs.existsSync(pitchPath) || !fs.existsSync(mp3Path)) {
    throw new Error(`Missing Saraga files in ${ragaDir}`);
  }

  // 1. Ground truth Sa tonic frequency
  const saFreq = parseFloat(fs.readFileSync(ctonicPath, 'utf8').trim());

  // 2. Ground truth pitch track (time-aligned f0)
  const pitchCsv = fs.readFileSync(pitchPath, 'utf8');
  let pitchTrack = parseSaragaPitchTrackCsv(pitchCsv);
  if (maxDurationSec > 0) {
    pitchTrack = pitchTrack.filter((f) => f.timestamp <= maxDurationSec);
  }

  // 3. Ground truth manual phrase solfège annotations if available
  const phrasesPath = path.join(ragaDir, `${trackName}.mphrases-manual.txt`);
  const phrases = [];
  if (fs.existsSync(phrasesPath)) {
    const pLines = fs.readFileSync(phrasesPath, 'utf8').trim().split('\n');
    for (const pl of pLines) {
      const parts = pl.trim().split(/\t+/);
      if (parts.length >= 4) {
        const startTime = parseFloat(parts[0]);
        const duration = parseFloat(parts[2]);
        const phrase = parts[3].trim();
        if (maxDurationSec <= 0 || startTime <= maxDurationSec) {
          phrases.push({ startTime, duration, phrase });
        }
      }
    }
  }

  // 4. Audio conversion via afconvert
  const tempWav = path.join('/tmp', `saraga_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
  try {
    const { execSync } = require('child_process');
    execSync(`afconvert -f WAVE -d LEF32@44100 "${mp3Path}" "${tempWav}"`);
    const wavResult = loadWavFile(tempWav);
    let samples = wavResult.samples;
    const sampleRate = wavResult.sampleRate;

    if (maxDurationSec > 0) {
      const maxSamples = Math.floor(maxDurationSec * sampleRate);
      if (samples.length > maxSamples) {
        samples = samples.subarray(0, maxSamples);
      }
    }
    const duration = samples.length / sampleRate;

    return {
      name: `Saraga: ${trackName} (${duration.toFixed(1)}s Real Performance)`,
      instrument: 'vocal',
      saPitch: 'Sa',
      saFrequency: saFreq,
      durationSeconds: duration,
      notes: [],
      pitchTrack,
      phrases,
      audioSamples: samples,
      sampleRate,
    };
  } finally {
    if (fs.existsSync(tempWav)) {
      try {
        fs.unlinkSync(tempWav);
      } catch {
        // ignore cleanup error
      }
    }
  }
}
