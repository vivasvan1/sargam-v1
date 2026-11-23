/**
 * Intermediate Music-Aware Data Representation for Audio-to-Sargam Transcription.
 * Decouples continuous pitch tracking from discrete beat-grid and Tala notation.
 */

export interface PitchContourPoint {
  time: number; // in seconds
  frequency: number; // in Hz (0 if unvoiced)
  centsFromSa: number; // cents relative to Sa tonic (0 = Sa, 100 = komal Re, etc.)
  clarity: number; // 0 to 1 confidence
  isVoiced: boolean;
  rms: number; // root-mean-square energy
}

export type ContinuousPitchContour = PitchContourPoint[];

export type OrnamentType = 'meend' | 'kan' | 'gamak' | 'andolan';

export interface NoteOrnament {
  type: OrnamentType;
  targetSwara?: string; // e.g. "P" if meend from G to P
  centsRange?: number; // deviation magnitude
}

export interface TranscribedNoteEvent {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  durationSeconds: number;
  swara: string; // "S", "r", "R", "g", "G", "m", "Mt", "P", "d", "D", "n", "N"
  octave: number; // strictly -1 (mandra), 0 (maddhya), 1 (taar)
  medianFrequencyHz: number;
  centsFromSa: number;
  confidence: number; // 0 to 1
  pitchContour: PitchContourPoint[];
  ornament?: NoteOrnament;
  manuallyEdited?: boolean;
}

export interface TalaConfig {
  id: string;
  name: string;
  displayName: string;
  beats: number;
  vibhags: number[];
  pattern?: string;
}

export interface TranscribedNoteGridToken {
  type: 'note' | 'rest' | 'skip';
  swara?: string;
  octave?: number;
  token: string; // e.g. "G:0.5", "S:0.5", "/:11"
  startTime: number;
  endTime: number;
  durationBeats: number;
}

export interface ModernTranscriptionResult {
  sargamCode: string;
  notes: TranscribedNoteGridToken[];
  events: TranscribedNoteEvent[];
  contour: ContinuousPitchContour;
  bpm: number;
  saPitch: string;
  saFrequency: number;
  tala: TalaConfig;
  totalDurationSeconds: number;
  totalDurationBeats: number;
  algorithm: 'YIN' | 'pYIN';
}
