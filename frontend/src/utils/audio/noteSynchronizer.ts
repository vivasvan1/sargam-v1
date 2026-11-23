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
  AudioSourceType,
  QuantizationMode,
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
  quantizationMode?: QuantizationMode;
  instrument?: AudioSourceType;
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
  const quantizationMode =
    options.quantizationMode || (tala.id === 'none' ? 'free' : 'flexible');

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

  const notes: TranscribedNote[] = [];

  // ===========================================================================
  // MODE 1: FREE / EVENT-DRIVEN NOTATION (Natural Durations)
  // ===========================================================================
  if (quantizationMode === 'free' || tala.id === 'none') {
    let prevEnd = audioStartTime;

    for (let i = 0; i < sortedEvents.length; i++) {
      const ev = sortedEvents[i];
      const gap = ev.startTime - prevEnd;

      // Natural breath / silence pause between phrases (>= 0.35s)
      if (gap >= 0.35) {
        const restDurBeats = Math.max(0.5, Math.round((gap / beatSec) * 2) / 2);
        notes.push({
          type: 'rest',
          token: restDurBeats === 1.0 ? '_' : `_:${restDurBeats}`,
          startTime: prevEnd,
          endTime: ev.startTime,
          durationBeats: restDurBeats,
        });
      }

      const durSec = Math.max(0.08, ev.endTime - ev.startTime);
      const rawBeats = durSec / beatSec;
      const durBeats = Math.max(0.25, Math.round(rawBeats * 4) / 4);

      let ornamentSuffix = '';
      if (ev.ornament) {
        if (ev.ornament.type === 'meend' && ev.ornament.targetSwara) {
          ornamentSuffix = `+meend(${ev.ornament.targetSwara})`;
        } else if (ev.ornament.type === 'kan' && ev.ornament.targetSwara) {
          ornamentSuffix = `+kan(${ev.ornament.targetSwara})`;
        }
      }

      const swaraStr = formatSwaraWithOctave(ev.swara, ev.octave);
      const durStr = durBeats === 1.0 ? '' : `:${durBeats}`;

      notes.push({
        type: 'note',
        swara: ev.swara,
        octave: ev.octave,
        token: `${swaraStr}${durStr}${ornamentSuffix}`,
        startTime: ev.startTime,
        endTime: ev.endTime,
        durationBeats: durBeats,
      });

      prevEnd = ev.endTime;
    }

    if (notes.length === 0) {
      return {
        sargamCode: [...headerLines, '', '_ ||'].join('\n'),
        notes: [],
        events: sortedEvents,
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

    // Group free notation into phrases separated by | and end with ||
    const phraseLines: string[] = [];
    let currentPhrase: string[] = [];
    let phraseBeats = 0;

    for (let i = 0; i < notes.length; i++) {
      currentPhrase.push(notes[i].token);
      phraseBeats += notes[i].durationBeats;

      const isRest = notes[i].type === 'rest';
      const isLongPhrase = phraseBeats >= 8;
      if ((isRest || isLongPhrase) && i < notes.length - 1) {
        currentPhrase.push('|');
        phraseLines.push(currentPhrase.join(' '));
        currentPhrase = [];
        phraseBeats = 0;
      }
    }

    if (currentPhrase.length > 0) {
      currentPhrase.push('||');
      phraseLines.push(currentPhrase.join(' '));
    }

    const sargamCode = [...headerLines, '', phraseLines.join('\n\n')].join('\n');
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
      totalDurationSeconds: notes.length > 0 ? notes[notes.length - 1].endTime : 0,
      totalDurationBeats: notes.reduce((sum, n) => sum + n.durationBeats, 0),
      algorithm: options.algorithm || 'pyin',
    };
  }

  // ===========================================================================
  // MODE 2 & 3: METERED TALA NOTATION (FLEXIBLE OR FIXED)
  // ===========================================================================
  const totalDurationSec = Math.max(0.1, audioEndTime - audioStartTime);
  const totalSubBeats = Math.ceil(totalDurationSec / subBeatSec);

  interface RawSlot {
    subBeatIndex: number;
    swara: string;
    octave: number;
    duration: number;
    isSilence: boolean;
    ornamentSuffix: string;
  }

  const rawSlots: RawSlot[] = [];

  for (let sb = 0; sb < totalSubBeats; sb++) {
    const slotStart = audioStartTime + sb * subBeatSec;
    const slotEnd = slotStart + subBeatSec;
    const slotMid = (slotStart + slotEnd) / 2;

    const matched = sortedEvents.find(
      (ev) =>
        (slotMid >= ev.startTime && slotMid < ev.endTime) ||
        (ev.startTime >= slotStart && ev.startTime < slotEnd)
    );

    if (!matched) {
      rawSlots.push({
        subBeatIndex: sb,
        swara: '_',
        octave: 0,
        duration: gridResolution,
        isSilence: true,
        ornamentSuffix: '',
      });
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

    rawSlots.push({
      subBeatIndex: sb,
      swara: matched.swara,
      octave: matched.octave,
      duration: gridResolution,
      isSilence: false,
      ornamentSuffix,
    });
  }

  // Merge identical held slots in Flexible mode
  const mergedSlots: RawSlot[] = [];
  for (const slot of rawSlots) {
    if (quantizationMode === 'flexible' && mergedSlots.length > 0) {
      const last = mergedSlots[mergedSlots.length - 1];
      if (
        !last.isSilence &&
        !slot.isSilence &&
        last.swara === slot.swara &&
        last.octave === slot.octave &&
        last.duration + slot.duration <= 4.0
      ) {
        last.duration += slot.duration;
        continue;
      }
    }
    mergedSlots.push({ ...slot });
  }

  let currentSlotTime = audioStartTime;
  for (const slot of mergedSlots) {
    const slotDurSec = slot.duration * beatSec;
    const startT = currentSlotTime;
    const endT = startT + slotDurSec;
    currentSlotTime = endT;

    if (slot.isSilence) {
      continue;
    }

    const swaraStr = formatSwaraWithOctave(slot.swara, slot.octave);
    const durStr = slot.duration === 1.0 ? '' : `:${slot.duration}`;
    notes.push({
      type: 'note',
      swara: slot.swara,
      octave: slot.octave,
      token: `${swaraStr}${durStr}${slot.ornamentSuffix}`,
      startTime: startT,
      endTime: endT,
      durationBeats: slot.duration,
    });
  }

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
