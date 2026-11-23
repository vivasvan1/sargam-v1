/**
 * Note Segmenter: Music-Aware Segmentation for Indian Classical Audio (Sitar, Vocal, etc.)
 *
 * Converts a continuous pitch contour into discrete TranscribedNoteEvents by analyzing:
 * 1. Pitch stability regions (variance < 45 cents).
 * 2. Pluck / onset energy transients (sharp attack dynamics).
 * 3. Meend trajectories (continuous pitch glides without re-striking).
 * 4. Minimum duration hysteresis to prevent vibrato jitter from over-segmenting.
 */

import type { PitchFrame } from './pitchDetector';
import type {
  ContinuousPitchContour,
  PitchContourPoint,
  TranscribedNoteEvent,
} from './types';
import { frequencyToSwara } from './sargamTranscriber';

export interface NoteSegmentationOptions {
  saFrequency: number;
  minNoteDurationSec?: number; // default: 0.08 (80ms)
  pitchStabilityCents?: number; // default: 45 cents
  onsetRmsFactor?: number; // default: 2.2
}

/**
 * Builds a ContinuousPitchContour from PitchFrames.
 */
export function buildContinuousPitchContour(
  frames: PitchFrame[],
  saFrequency: number
): ContinuousPitchContour {
  return frames.map((f) => {
    const centsFromSa =
      f.frequency > 0 && saFrequency > 0
        ? 1200 * Math.log2(f.frequency / saFrequency)
        : 0;
    return {
      time: f.time,
      frequency: f.frequency,
      centsFromSa,
      clarity: f.clarity,
      isVoiced: f.isVoiced,
      rms: f.rms,
    };
  });
}

/**
 * Segments continuous pitch frames into musical TranscribedNoteEvents.
 */
export function segmentNotesFromContour(
  frames: PitchFrame[],
  options: NoteSegmentationOptions
): { notes: TranscribedNoteEvent[]; contour: ContinuousPitchContour } {
  const saFreq = options.saFrequency;
  const minDur = options.minNoteDurationSec ?? 0.08;
  const contour = buildContinuousPitchContour(frames, saFreq);

  if (frames.length === 0) {
    return { notes: [], contour };
  }

  const rawNotes: {
    startIdx: number;
    endIdx: number;
    isMeend: boolean;
    startSwara?: string;
    targetSwara?: string;
  }[] = [];

  let inVoiced = false;
  let segStartIdx = 0;
  let runningCentsSum = 0;
  let runningCount = 0;

  for (let i = 0; i < contour.length; i++) {
    const pt = contour[i];

    if (!inVoiced) {
      if (pt.isVoiced && pt.frequency > 0) {
        inVoiced = true;
        segStartIdx = i;
        runningCentsSum = pt.centsFromSa;
        runningCount = 1;
      }
      continue;
    }

    // Currently inside a voiced segment
    if (!pt.isVoiced || pt.frequency === 0) {
      // Voiced segment ended
      if (i - segStartIdx >= 3) {
        rawNotes.push({
          startIdx: segStartIdx,
          endIdx: i - 1,
          isMeend: false,
        });
      }
      inVoiced = false;
      continue;
    }

    // Check for onset or swara pitch jump inside sustained voiced sound
    const currentMeanCents = runningCentsSum / (runningCount || 1);
    const centsDiffFromMean = Math.abs(pt.centsFromSa - currentMeanCents);

    // Energy pluck detection (sitar da/ra stroke)
    const prevPt = contour[i - 1];
    const hasSharpPluck =
      prevPt && prevPt.rms > 0.005 && pt.rms > prevPt.rms * (options.onsetRmsFactor ?? 2.2);

    // Substantial pitch transition (>= 70 cents)
    const hasPitchTransition = centsDiffFromMean >= 70;

    const currentDuration = pt.time - contour[segStartIdx].time;

    if ((hasSharpPluck || hasPitchTransition) && currentDuration >= minDur) {
      // Check if this was a continuous meend glide
      const startCents = contour[segStartIdx].centsFromSa;
      const endCents = contour[i - 1].centsFromSa;
      const totalGlideCents = Math.abs(endCents - startCents);
      const isMeendGlide = !hasSharpPluck && totalGlideCents >= 140;

      rawNotes.push({
        startIdx: segStartIdx,
        endIdx: i - 1,
        isMeend: isMeendGlide,
      });

      segStartIdx = i;
      runningCentsSum = pt.centsFromSa;
      runningCount = 1;
    } else {
      runningCentsSum += pt.centsFromSa;
      runningCount++;
    }
  }

  // Handle trailing voiced segment
  if (inVoiced && contour.length - segStartIdx >= 3) {
    rawNotes.push({
      startIdx: segStartIdx,
      endIdx: contour.length - 1,
      isMeend: false,
    });
  }

  // Convert raw index ranges to TranscribedNoteEvents
  const notes: TranscribedNoteEvent[] = [];
  let noteCounter = 1;

  for (const raw of rawNotes) {
    const slice = contour.slice(raw.startIdx, raw.endIdx + 1);
    const startTime = slice[0].time;
    const endTime = slice[slice.length - 1].time;
    const duration = endTime - startTime;

    if (duration < minDur * 0.7) {
      continue; // Filter out tiny acoustic glitches
    }

    // Median frequency
    const voicedSlice = slice.filter((p) => p.isVoiced && p.frequency > 0);
    if (voicedSlice.length === 0) continue;

    const sortedFreqs = voicedSlice.map((p) => p.frequency).sort((a, b) => a - b);
    const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];

    // Swara mapping
    const { swara, octave, centsFromSa } = frequencyToSwara(medianFreq, saFreq);
    const avgClarity =
      voicedSlice.reduce((sum, p) => sum + p.clarity, 0) / voicedSlice.length;

    // Check ornament
    let ornament: TranscribedNoteEvent['ornament'] = undefined;
    if (raw.isMeend) {
      const targetFreq = slice[slice.length - 1].frequency;
      const targetSwaraInfo = frequencyToSwara(targetFreq, saFreq);
      ornament = {
        type: 'meend',
        targetSwara: targetSwaraInfo.swara,
      };
    }

    notes.push({
      id: `note-${noteCounter++}`,
      startTime,
      endTime,
      durationSeconds: duration,
      swara,
      octave,
      medianFrequencyHz: medianFreq,
      centsFromSa,
      confidence: Number(avgClarity.toFixed(3)),
      pitchContour: slice,
      ornament,
    });
  }

  return { notes, contour };
}
