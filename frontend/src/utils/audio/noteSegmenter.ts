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
  AudioSourceType,
} from './types';
import { frequencyToSwara } from './sargamTranscriber';

export interface AcousticProfile {
  minNoteDurationSec: number;
  pitchStabilityCents: number;
  onsetRmsFactor: number;
  pitchTransitionCents: number;
  minMeendGlideCents: number;
  detectSyllableDips: boolean;
}

export const INSTRUMENT_PROFILES: Record<AudioSourceType, AcousticProfile> = {
  vocal: {
    minNoteDurationSec: 0.09, // prevents vocal vibrato/gamak from over-segmenting
    pitchStabilityCents: 55, // vocalists exhibit ~30-50 cents natural vibrato
    onsetRmsFactor: 1.6, // vocal syllables have gentler attacks than plucked strings
    pitchTransitionCents: 65,
    minMeendGlideCents: 110,
    detectSyllableDips: true, // consonant / syllable re-articulations on sustained notes
  },
  sitar: {
    minNoteDurationSec: 0.07,
    pitchStabilityCents: 45,
    onsetRmsFactor: 2.2, // sharp metallic mizrab pluck transient
    pitchTransitionCents: 60,
    minMeendGlideCents: 130,
    detectSyllableDips: false,
  },
  sarod: {
    minNoteDurationSec: 0.07,
    pitchStabilityCents: 45,
    onsetRmsFactor: 2.0, // coconut shell plectrum (jawa)
    pitchTransitionCents: 60,
    minMeendGlideCents: 120,
    detectSyllableDips: false,
  },
  flute: {
    minNoteDurationSec: 0.09,
    pitchStabilityCents: 50,
    onsetRmsFactor: 1.7,
    pitchTransitionCents: 65,
    minMeendGlideCents: 110,
    detectSyllableDips: true,
  },
  harmonium: {
    minNoteDurationSec: 0.08,
    pitchStabilityCents: 35, // very stable mechanical reed pitch
    onsetRmsFactor: 1.8,
    pitchTransitionCents: 55,
    minMeendGlideCents: 999, // no meend on keyboard/reeds
    detectSyllableDips: false,
  },
  violin: {
    minNoteDurationSec: 0.08,
    pitchStabilityCents: 50,
    onsetRmsFactor: 1.8,
    pitchTransitionCents: 65,
    minMeendGlideCents: 110,
    detectSyllableDips: false,
  },
  general: {
    minNoteDurationSec: 0.08,
    pitchStabilityCents: 50,
    onsetRmsFactor: 1.8,
    pitchTransitionCents: 65,
    minMeendGlideCents: 120,
    detectSyllableDips: true,
  },
};

export interface NoteSegmentationOptions {
  saFrequency: number;
  instrument?: AudioSourceType;
  minNoteDurationSec?: number; // override profile default if set
  pitchStabilityCents?: number; // override profile default if set
  onsetRmsFactor?: number; // override profile default if set
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
  const instrument = options.instrument || 'vocal';
  const profile = INSTRUMENT_PROFILES[instrument] || INSTRUMENT_PROFILES.general;
  const minDur = options.minNoteDurationSec ?? profile.minNoteDurationSec;
  const onsetFactor = options.onsetRmsFactor ?? profile.onsetRmsFactor;
  const transitionThreshold = profile.pitchTransitionCents;
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

    // 1. Pluck / transient detection (sharp attack)
    const prevPt = contour[i - 1];
    const hasSharpPluck =
      prevPt && prevPt.rms > 0.004 && pt.rms > prevPt.rms * onsetFactor;

    // 2. Vocal / Flute syllable re-articulation detection:
    // When a vocalist sings new words/syllables on sustained notes,
    // a brief dip in RMS occurs (consonant or breath inflection) followed by re-aspiration.
    let hasSyllableDip = false;
    if (profile.detectSyllableDips && i >= 3 && prevPt) {
      const pPrev = contour[i - 2];
      const isValley = prevPt.rms < pPrev.rms * 0.72 && pt.rms > prevPt.rms * 1.35;
      if (isValley && pt.rms > 0.008) {
        hasSyllableDip = true;
      }
    }

    // 3. Substantial pitch transition between swaras
    const hasPitchTransition = centsDiffFromMean >= transitionThreshold;

    const currentDuration = pt.time - contour[segStartIdx].time;

    if ((hasSharpPluck || hasSyllableDip || hasPitchTransition) && currentDuration >= minDur) {
      // Check if this was a continuous meend glide
      const startCents = contour[segStartIdx].centsFromSa;
      const endCents = contour[i - 1].centsFromSa;
      const totalGlideCents = Math.abs(endCents - startCents);
      const isMeendGlide =
        !hasSharpPluck &&
        !hasSyllableDip &&
        totalGlideCents >= profile.minMeendGlideCents;

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
