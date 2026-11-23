/**
 * Note Synchronizer: Two-Way Recalculation Engine.
 *
 * Takes an edited array of TranscribedNoteEvents (with adjusted boundaries,
 * swaras, octaves, or ornaments) and recalculates:
 * 1. Beat-grid aligned TranscribedNotes.
 * 2. Properly formatted sargam-v1 code grouped by Tala avartans.
 */

import type {
  TranscribedNoteEvent,
  TalaConfig,
  TranscribedNoteGridToken,
} from './types';
import {
  TALA_PRESETS,
  formatSwaraWithOctave,
  type TranscribedNote,
  type TranscriptionOptions,
  type TranscriptionResult,
} from './sargamTranscriber';
import { RAGA_PRESETS, type RagaDefinition } from './raga/ragaDefinitions';
import type { ContinuousPitchContour } from './types';

export interface RecalculateOptions {
  bpm: number;
  talaId?: string;
  pickupBeat?: number;
  gridResolution?: 0.5 | 0.25;
  ragaId?: string;
  algorithm?: 'yin' | 'pyin';
}

export function recalculateTranscriptionFromEvents(
  events: TranscribedNoteEvent[],
  contour: ContinuousPitchContour,
  saPitch: string,
  saFrequency: number,
  options: RecalculateOptions
): TranscriptionResult {
  const bpm = options.bpm || 50;
  const talaKey = options.talaId && TALA_PRESETS[options.talaId] ? options.talaId : 'tintal';
  const tala = TALA_PRESETS[talaKey];
  const ragaKey = options.ragaId && RAGA_PRESETS[options.ragaId] ? options.ragaId : 'none';
  const raga = RAGA_PRESETS[ragaKey];
  const pickupBeat = options.pickupBeat !== undefined ? options.pickupBeat : 12;
  const gridResolution = options.gridResolution || 0.5;
  const beatSec = 60 / bpm;
  const subBeatSec = beatSec * gridResolution;

  // Header directives
  const headerLines: string[] = [`@sa ${saPitch}`];
  if (tala.id !== 'none') {
    headerLines.push(`@tala ${tala.name}`);
    if (tala.pattern) {
      headerLines.push(`@tala_pattern ${tala.pattern}`);
    }
  }
  if (raga.id !== 'none') {
    headerLines.push(`@raga ${raga.name}`);
  }
  headerLines.push(`@tempo ${bpm}`);

  if (events.length === 0) {
    return {
      sargamCode: [...headerLines, '', '_ ||'].join('\n'),
      notes: [],
      events: [],
      contour,
      bpm,
      saPitch,
      saFrequency,
      tala,
      raga,
      totalDurationSeconds: 0,
      totalDurationBeats: 0,
      algorithm: options.algorithm || 'pyin',
    };
  }

  // Sort events by startTime
  const sortedEvents = [...events].sort((a, b) => a.startTime - b.startTime);
  const audioStartTime = sortedEvents[0].startTime;
  const audioEndTime = sortedEvents[sortedEvents.length - 1].endTime;
  const totalDurationSec = Math.max(0.1, audioEndTime - audioStartTime);
  const totalSubBeats = Math.ceil(totalDurationSec / subBeatSec);

  // Map each sub-beat slot to the corresponding event
  const notes: TranscribedNote[] = [];

  for (let sb = 0; sb < totalSubBeats; sb++) {
    const slotStart = audioStartTime + sb * subBeatSec;
    const slotEnd = slotStart + subBeatSec;
    const slotMid = (slotStart + slotEnd) / 2;

    // Find the event that covers this sub-beat
    const matched = sortedEvents.find(
      (ev) =>
        (slotMid >= ev.startTime && slotMid < ev.endTime) ||
        (ev.startTime >= slotStart && ev.startTime < slotEnd)
    );

    if (!matched) {
      // Silence / rest
      continue;
    }

    let ornamentSuffix = '';
    if (matched.ornament) {
      if (matched.ornament.type === 'meend' && matched.ornament.targetSwara) {
        ornamentSuffix = `+meend(${matched.ornament.targetSwara})`;
      } else if (matched.ornament.type === 'kan' && matched.ornament.targetSwara) {
        ornamentSuffix = `+kan(${matched.ornament.targetSwara})`;
      }
    }

    const swaraStr = formatSwaraWithOctave(matched.swara, matched.octave);
    notes.push({
      type: 'note',
      swara: matched.swara,
      octave: matched.octave,
      token: `${swaraStr}:${gridResolution}${ornamentSuffix}`,
      startTime: slotStart,
      endTime: slotEnd,
      durationBeats: gridResolution,
    });
  }

  // Deduplicate identical sequential tokens if duration can be cleanly merged,
  // or keep grid tokens aligned with tala.
  // Group into Avartans
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

  const sargamCode = [...headerLines, '', noteLines.join('\n\n')].join('\n');
  const totalDurationSeconds = notes.length > 0 ? notes[notes.length - 1].endTime : 0;
  const totalDurationBeats = notes.reduce((sum, n) => sum + n.durationBeats, 0);

  return {
    sargamCode,
    notes,
    events: sortedEvents,
    contour,
    bpm,
    saPitch,
    saFrequency,
    tala,
    raga,
    totalDurationSeconds,
    totalDurationBeats,
    algorithm: options.algorithm || 'pyin',
  };
}
