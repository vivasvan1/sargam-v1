/**
 * Raga-Aware Note Scorer & Validator.
 *
 * Enhances transcription accuracy by using classical scale structures:
 * 1. Validates notes against the selected Raga scale.
 * 2. Identifies spurious varjit (omitted) notes in melodic glides (e.g. Ga in Raag Durga)
 *    and converts them into meend/kan ornaments on the legitimate raga swaras.
 * 3. Boosts confidence for Vadi and Samvadi melodic centers.
 */

import type { TranscribedNoteEvent } from '../types';
import type { RagaDefinition } from './ragaDefinitions';
import { frequencyToSwara } from '../sargamTranscriber';

const SWARA_SEMITONES: Record<string, number> = {
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

export function applyRagaCorrection(
  notes: TranscribedNoteEvent[],
  raga: RagaDefinition,
  saFrequency: number
): TranscribedNoteEvent[] {
  if (!raga || raga.id === 'none') {
    return notes;
  }

  const allowedSet = new Set(raga.allowedSwaras);
  const varjitSet = new Set(raga.varjitSwaras);

  const correctedNotes: TranscribedNoteEvent[] = [];

  for (let i = 0; i < notes.length; i++) {
    const current = { ...notes[i] };
    const swara = current.swara;

    // 1. If note is allowed in the raga
    if (allowedSet.has(swara)) {
      // Vadi / Samvadi importance boost
      if (swara === raga.vadi || swara === raga.samvadi) {
        current.confidence = Math.min(1.0, current.confidence + 0.1);
      }
      correctedNotes.push(current);
      continue;
    }

    // 2. Note is NOT in the allowed scale (e.g. Varjit note)
    const prev = correctedNotes.length > 0 ? correctedNotes[correctedNotes.length - 1] : null;
    const next = i + 1 < notes.length ? notes[i + 1] : null;

    // Check if this was a transient glide passing through a varjit swara
    // e.g. in Raag Durga: m -> [brief G] -> R
    if (
      prev &&
      next &&
      allowedSet.has(prev.swara) &&
      allowedSet.has(next.swara) &&
      current.durationSeconds < 0.25
    ) {
      // Absorb the passing varjit note into a meend glide from prev to next!
      prev.endTime = current.endTime;
      prev.durationSeconds = prev.endTime - prev.startTime;
      prev.ornament = {
        type: 'meend',
        targetSwara: next.swara,
      };
      // Append contour points to prev
      prev.pitchContour = [...prev.pitchContour, ...current.pitchContour];
      continue;
    }

    // 3. If note is sustained or standalone, find closest allowed raga swara
    const currentSemitone = (SWARA_SEMITONES[swara] ?? 0) + current.octave * 12;
    let closestSwara = swara;
    let minDistance = Infinity;

    for (const allowed of raga.allowedSwaras) {
      // Check in same octave and neighboring octaves
      for (const oct of [current.octave - 1, current.octave, current.octave + 1]) {
        const allowedSemitone = (SWARA_SEMITONES[allowed] ?? 0) + oct * 12;
        const dist = Math.abs(currentSemitone - allowedSemitone);
        if (dist < minDistance) {
          minDistance = dist;
          closestSwara = allowed;
        }
      }
    }

    // If within 1 semitone, correct to closest allowed swara
    if (minDistance <= 1) {
      current.swara = closestSwara;
      // Mark as raga-corrected
      current.confidence = Math.max(0.4, current.confidence * 0.9);
    }

    correctedNotes.push(current);
  }

  return correctedNotes;
}
