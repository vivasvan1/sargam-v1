/**
 * Types for Audio Pitch & Sargam Transcription Benchmarking.
 * Standardized across Indian Art Music (Saraga format) and Monophonic MIR.
 */

export interface GroundTruthPitchFrame {
  timestamp: number; // in seconds
  frequency: number; // in Hz (0 if unvoiced)
}

export interface GroundTruthNote {
  startTime: number; // in seconds
  endTime: number; // in seconds
  swara: string; // e.g. "S", "r", "R", "g", "G", "m", "Mt", "P", "d", "D", "n", "N"
  octave: number; // -1, 0, 1
  frequency: number; // in Hz
  midiNote?: number; // Western equivalent MIDI note (e.g. 62 for D4)
  isOrnamenteed?: boolean; // meend / glide
}

export interface GroundTruthDataset {
  name: string;
  instrument: 'sitar' | 'vocal' | 'flute' | 'harmonium' | 'synthetic';
  saPitch: string; // e.g. "D4"
  saFrequency: number; // e.g. 293.66
  durationSeconds: number;
  pitchTrack: GroundTruthPitchFrame[];
  notes: GroundTruthNote[];
  audioSamples?: Float32Array;
  sampleRate?: number;
}

export interface BenchmarkMetrics {
  totalVoicedFrames: number;
  totalUnvoicedFrames: number;
  
  // Pitch accuracy
  medianCentsError: number; // Median absolute error in cents on correctly voiced frames
  rawPitchAccuracy: number; // % of voiced frames with pitch within ±50 cents of ground truth
  overallPitchAccuracy: number; // % of frames with correct voicing AND pitch within ±50 cents
  octaveErrorRate: number; // % of voiced frames misclassified by approximately ±1200 or ±2400 cents (octave halving/doubling)
  
  // Note segmentation & transcription accuracy
  notePrecision: number; // detected notes matching ground truth / total detected
  noteRecall: number; // ground truth notes matched / total ground truth
  noteF1: number; // harmonic mean of precision & recall
  onsetMedianErrorMs: number; // median error in milliseconds for matched onsets
  swaraLabelAccuracy: number; // % of matched notes with exact matching swara and octave
}

export interface BenchmarkComparisonResult {
  datasetName: string;
  algorithm: 'YIN' | 'pYIN';
  metrics: BenchmarkMetrics;
}
