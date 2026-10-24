/**
 * Sargam Transcriber v2
 * High-fidelity, beat-grid synchronized Indian Classical notation generator.
 */

import { YinPitchDetector, type PitchFrame } from './pitchDetector';

export interface TalaConfig {
  id: string;
  name: string;
  displayName: string;
  beats: number;
  vibhags: number[];
  pattern?: string;
}

export const TALA_PRESETS: Record<string, TalaConfig> = {
  tintal: {
    id: 'tintal',
    name: 'Tintal(16)',
    displayName: 'Tintal (16 beats: 4+4+4+4)',
    beats: 16,
    vibhags: [4, 4, 4, 4],
    pattern:
      'dha dhin dhin dha | dha dhin dhin dha | dha tin tin ta | ta dhin dhin dha',
  },
  ektaal: {
    id: 'ektaal',
    name: 'Ektaal(12)',
    displayName: 'Ektaal (12 beats: 2+2+2+2+2+2)',
    beats: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    pattern:
      'dhin dhin | dhaage tirakita | tu na | kat ta | dhaage tirakita | dhi na',
  },
  jhaptal: {
    id: 'jhaptal',
    name: 'Jhaptal(10)',
    displayName: 'Jhaptal (10 beats: 2+3+2+3)',
    beats: 10,
    vibhags: [2, 3, 2, 3],
    pattern: 'dhi na | dhi dhi na | ti na | dhi dhi na',
  },
  rupak: {
    id: 'rupak',
    name: 'Rupak(7)',
    displayName: 'Rupak (7 beats: 3+2+2)',
    beats: 7,
    vibhags: [3, 2, 2],
    pattern: 'tin tin na | dhi na | dhi na',
  },
  keharwa: {
    id: 'keharwa',
    name: 'Keharwa(8)',
    displayName: 'Keharwa (8 beats: 4+4)',
    beats: 8,
    vibhags: [4, 4],
    pattern: 'dha ge na ti | na ka dhi na',
  },
  dadra: {
    id: 'dadra',
    name: 'Dadra(6)',
    displayName: 'Dadra (6 beats: 3+3)',
    beats: 6,
    vibhags: [3, 3],
    pattern: 'dha dhi na | dha ti na',
  },
  none: {
    id: 'none',
    name: 'Free',
    displayName: 'Free Rhythm / No Tala',
    beats: 16,
    vibhags: [16],
  },
};

export interface TranscribedNote {
  type: 'note' | 'rest' | 'skip';
  swara?: string; // "S", "r", "R", "g", "G", "m", "Mt", "P", "d", "D", "n", "N"
  octave?: number; // strictly -1, 0, or 1
  token: string; // e.g. "G:0.5", "S:0.5", "/:11"
  startTime: number;
  endTime: number;
  durationBeats: number;
}

export interface TranscriptionOptions {
  bpm?: number;
  talaId?: string; // 'tintal', 'ektaal', etc. (default: 'tintal')
  pickupBeat?: number; // 1 (Sam), 12 (Tintal standard pickup), 9 (Khali), etc.
  gridResolution?: 0.5 | 0.25; // 0.5 (dugun = 2 notes/beat) or 0.25 (chaugun)
  initialSilenceSec?: number; // seconds of initial silence to skip
  clarityThreshold?: number;
  silenceThreshold?: number;
}

export interface TranscriptionResult {
  sargamCode: string;
  notes: TranscribedNote[];
  bpm: number;
  saPitch: string;
  saFrequency: number;
  tala: TalaConfig;
  totalDurationSeconds: number;
  totalDurationBeats: number;
}

const SWARA_TABLE = [
  'S', // 0 semitone
  'r', // 1 semitone (komal Re)
  'R', // 2 semitones (shuddha Re)
  'g', // 3 semitones (komal Ga)
  'G', // 4 semitones (shuddha Ga)
  'm', // 5 semitones (shuddha Ma)
  'Mt', // 6 semitones (tivra Ma)
  'P', // 7 semitones (shuddha Pa)
  'd', // 8 semitones (komal Dha)
  'D', // 9 semitones (shuddha Dha)
  'n', // 10 semitones (komal Ni)
  'N', // 11 semitones (shuddha Ni)
];

/**
 * Maps fundamental frequency to relative Indian Classical Swara with strict octave clamping.
 * Melody spans mandra (-1), maddhya (0), and taar (1).
 */
export function frequencyToSwara(
  freq: number,
  saFreq: number,
  prevOctave = 0
): { swara: string; octave: number; centsFromSa: number } {
  if (freq <= 0 || saFreq <= 0) {
    return { swara: 'S', octave: 0, centsFromSa: 0 };
  }

  let cents = 1200 * Math.log2(freq / saFreq);
  let roundedSemitones = Math.round(cents / 100);
  let octave = Math.floor(roundedSemitones / 12);

  // Strictly clamp octave to [-1, 1]. Indian classical melody never goes to ,, or ''
  if (octave < -1) {
    roundedSemitones += 12 * (-1 - octave);
    octave = -1;
  } else if (octave > 1) {
    roundedSemitones -= 12 * (octave - 1);
    octave = 1;
  }

  const pitchClass = ((roundedSemitones % 12) + 12) % 12;
  const swara = SWARA_TABLE[pitchClass];

  return {
    swara,
    octave,
    centsFromSa: cents,
  };
}

export function formatSwaraWithOctave(swara: string, octave: number): string {
  if (octave > 0) {
    return `${swara}'`;
  } else if (octave < 0) {
    return `${swara},`;
  }
  return swara;
}

/**
 * Transcribes audio into beat-grid aligned Indian Classical Sargam notation.
 */
export function transcribeAudioToSargam(
  samples: Float32Array,
  sampleRate: number,
  saPitch: string,
  saFrequency: number,
  options: TranscriptionOptions = {}
): TranscriptionResult {
  const bpm = options.bpm || 50;
  const talaKey = options.talaId && TALA_PRESETS[options.talaId] ? options.talaId : 'tintal';
  const tala = TALA_PRESETS[talaKey];
  const pickupBeat = options.pickupBeat !== undefined ? options.pickupBeat : 12; // Default 12 for Tintal
  const gridResolution = options.gridResolution || 0.5; // 0.5 (dugun = 2 sub-beats/beat)
  const beatSec = 60 / bpm;
  const subBeatSec = beatSec * gridResolution;

  // 1. Analyze audio pitch frames with YIN
  const pitchDetector = new YinPitchDetector({
    sampleRate,
    frameSize: 2048,
    hopSize: 512,
    threshold: 0.15,
    clarityThreshold: options.clarityThreshold || 0.45,
    silenceThreshold: options.silenceThreshold || 0.008,
  });

  const frames: PitchFrame[] = pitchDetector.analyze(samples);

  if (frames.length === 0) {
    return {
      sargamCode: `@sa ${saPitch}\n@tempo ${bpm}\n_ ||`,
      notes: [],
      bpm,
      saPitch,
      saFrequency,
      tala,
      totalDurationSeconds: 0,
      totalDurationBeats: 0,
    };
  }

  // 2. Find start offset: use options.initialSilenceSec if provided, otherwise find first sustained note
  let audioStartTime = 0;
  if (options.initialSilenceSec !== undefined && options.initialSilenceSec >= 0) {
    audioStartTime = options.initialSilenceSec;
  } else {
    // Find first sustained run of voiced frames (>= 120ms with consistent musical energy)
    for (let i = 0; i < frames.length - 10; i++) {
      let voicedCount = 0;
      for (let j = 0; j < 10; j++) {
        if (frames[i + j].isVoiced && frames[i + j].frequency > 0 && frames[i + j].rms > 0.015) {
          voicedCount++;
        }
      }
      if (voicedCount >= 7) {
        audioStartTime = frames[i].time;
        break;
      }
    }
  }

  const audioEndTime = frames[frames.length - 1].time;
  const playableDurationSec = Math.max(0.1, audioEndTime - audioStartTime);
  const totalSubBeats = Math.ceil(playableDurationSec / subBeatSec);

  // 3. Grid-quantized frame classification into sub-beat slots (Vocal / Flute continuous melody)
  interface SubBeatSlot {
    subBeatIndex: number;
    swara: string;
    octave: number;
    duration: number; // e.g. 0.5 or 0.25
    isSilence: boolean;
  }

  const slots: SubBeatSlot[] = [];
  let prevActiveSwara = 'S';
  let prevActiveOctave = 0;

  for (let sb = 0; sb < totalSubBeats; sb++) {
    const slotStart = audioStartTime + sb * subBeatSec;
    const slotEnd = slotStart + subBeatSec;

    const slotFrames = frames.filter(
      (f) => f.time >= slotStart && f.time < slotEnd
    );

    const voicedFrames = slotFrames.filter((f) => f.isVoiced && f.frequency > 0);
    const avgRms =
      slotFrames.reduce((acc, f) => acc + f.rms, 0) / (slotFrames.length || 1);

    // Median frequency in slot
    const sortedFreqs = voicedFrames.map((f) => f.frequency).sort((a, b) => a - b);
    const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)] || 0;

    if (voicedFrames.length === 0) {
      // Sustain previous vocal/flute note across breath/decay if energy is present
      if (avgRms > 0.006 && prevActiveSwara) {
        slots.push({
          subBeatIndex: sb,
          swara: prevActiveSwara,
          octave: prevActiveOctave,
          duration: gridResolution,
          isSilence: false,
        });
      } else {
        slots.push({
          subBeatIndex: sb,
          swara: '_',
          octave: 0,
          duration: gridResolution,
          isSilence: true,
        });
      }
      continue;
    }

    // Check for fast stroke inside this 0.5 beat (two 0.25 notes, e.g. D,:0.25 D,:0.25)
    const halfLen = Math.floor(slotFrames.length / 2);
    const firstHalfVoiced = slotFrames.slice(0, halfLen).filter((f) => f.isVoiced);
    const secondHalfVoiced = slotFrames.slice(halfLen).filter((f) => f.isVoiced);

    if (firstHalfVoiced.length > 0 && secondHalfVoiced.length > 0) {
      const midSlice = slotFrames.slice(Math.floor(halfLen * 0.7), Math.floor(halfLen * 1.3));
      const minMidRms = midSlice.length > 0 ? Math.min(...midSlice.map((f) => f.rms)) : 1;
      const secondMaxRms = Math.max(...secondHalfVoiced.map((f) => f.rms));
      const hasDistinctSecondAttack = secondMaxRms > minMidRms * 2.2 && minMidRms < 0.015;

      const f1 = firstHalfVoiced[Math.floor(firstHalfVoiced.length / 2)].frequency;
      const f2 = secondHalfVoiced[Math.floor(secondHalfVoiced.length / 2)].frequency;
      const n1 = frequencyToSwara(f1, saFrequency, prevActiveOctave);
      const n2 = frequencyToSwara(f2, saFrequency, n1.octave);

      if (hasDistinctSecondAttack || (n1.swara !== n2.swara && Math.abs(f1 - f2) > 10)) {
        // Two distinct 0.25 notes!
        slots.push({
          subBeatIndex: sb,
          swara: n1.swara,
          octave: n1.octave,
          duration: 0.25,
          isSilence: false,
        });
        slots.push({
          subBeatIndex: sb,
          swara: n2.swara,
          octave: n2.octave,
          duration: 0.25,
          isSilence: false,
        });
        prevActiveSwara = n2.swara;
        prevActiveOctave = n2.octave;
        continue;
      }
    }

    const { swara, octave } = frequencyToSwara(medianFreq, saFrequency, prevActiveOctave);
    prevActiveSwara = swara;
    prevActiveOctave = octave;

    slots.push({
      subBeatIndex: sb,
      swara,
      octave,
      duration: gridResolution,
      isSilence: false,
    });
  }

  // 4. Convert slots into tokens with explicit durations (:0.5, :0.25)
  const notes: TranscribedNote[] = [];

  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    if (slot.isSilence) {
      continue;
    }

    const swaraStr = formatSwaraWithOctave(slot.swara, slot.octave);
    notes.push({
      type: 'note',
      swara: slot.swara,
      octave: slot.octave,
      token: `${swaraStr}:${slot.duration}`,
      startTime: audioStartTime + s * subBeatSec,
      endTime: audioStartTime + (s + 1) * subBeatSec,
      durationBeats: slot.duration,
    });
  }

  // 5. Build clean, idiomatic sargam-v1 notation grouped by Tala avartan
  const headerLines: string[] = [`@sa ${saPitch}`];

  if (tala.id !== 'none') {
    headerLines.push(`@tala ${tala.name}`);
    if (tala.pattern) {
      headerLines.push(`@tala_pattern ${tala.pattern}`);
    }
  }

  headerLines.push(`@tempo ${bpm}`);

  if (notes.length === 0) {
    return {
      sargamCode: [...headerLines, '', '_ ||'].join('\n'),
      notes: [],
      bpm,
      saPitch,
      saFrequency,
      tala,
      totalDurationSeconds: 0,
      totalDurationBeats: 0,
    };
  }

  // Format notes into avartans
  // Line 1: /:skipBeats followed by notes that finish the first cycle (ending with |)
  // Line 2: next cycle of notes (ending with ||)
  const cycleBeats = tala.beats || 16;
  const skipBeats = pickupBeat > 1 ? pickupBeat - 1 : 0;
  const beatsInFirstCycle = cycleBeats - skipBeats;

  const noteLines: string[] = [];
  let line1Tokens: string[] = [];

  if (skipBeats > 0) {
    line1Tokens.push(`/:${skipBeats}`);
  }

  let noteIdx = 0;
  let line1Beats = 0;

  while (noteIdx < notes.length && line1Beats + notes[noteIdx].durationBeats <= beatsInFirstCycle) {
    line1Tokens.push(notes[noteIdx].token);
    line1Beats += notes[noteIdx].durationBeats;
    noteIdx++;
  }

  line1Tokens.push('|');
  noteLines.push(line1Tokens.join(' '));

  // Line 2 and onwards:
  while (noteIdx < notes.length) {
    let currentLineTokens: string[] = [];
    let lineBeats = 0;

    while (noteIdx < notes.length && lineBeats + notes[noteIdx].durationBeats <= cycleBeats) {
      currentLineTokens.push(notes[noteIdx].token);
      lineBeats += notes[noteIdx].durationBeats;
      noteIdx++;
    }

    if (noteIdx >= notes.length) {
      currentLineTokens.push('||');
    } else {
      currentLineTokens.push('|');
    }
    noteLines.push(currentLineTokens.join(' '));
  }

  // Join lines with an empty line separating avartans, NO comments
  const sargamCode = [
    ...headerLines,
    '',
    noteLines.join('\n\n'),
  ].join('\n');

  const totalDurationSeconds =
    notes.length > 0 ? notes[notes.length - 1].endTime : 0;
  const totalDurationBeats = notes.reduce((sum, n) => sum + n.durationBeats, 0);

  return {
    sargamCode,
    notes,
    bpm,
    saPitch,
    saFrequency,
    tala,
    totalDurationSeconds,
    totalDurationBeats,
  };
}
