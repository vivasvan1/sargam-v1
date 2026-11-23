import type {
  GroundTruthDataset,
  GroundTruthNote,
  BenchmarkMetrics,
} from './types';
import type { PitchFrame } from '../pitchDetector';

export interface EvaluatorNoteInput {
  startTime: number;
  endTime: number;
  swara?: string;
  octave?: number;
}

export function evaluatePitchAndNotes(
  groundTruth: GroundTruthDataset,
  detectedFrames: PitchFrame[],
  detectedNotes: EvaluatorNoteInput[],
  onsetToleranceSec = 0.08 // 80ms onset tolerance
): BenchmarkMetrics {
  const truthFrames = groundTruth.pitchTrack;
  let totalVoiced = 0;
  let totalUnvoiced = 0;
  let correctVoicingAndPitch = 0;
  let voicedWithin50Cents = 0;
  let octaveErrors = 0;
  const centsErrors: number[] = [];

  for (const tFrame of truthFrames) {
    // Find closest detected frame in time
    const detFrame = findClosestFrame(detectedFrames, tFrame.timestamp);
    const truthVoiced = tFrame.frequency > 10;
    const detVoiced = detFrame ? detFrame.isVoiced && detFrame.frequency > 10 : false;

    if (truthVoiced) {
      totalVoiced++;
      if (detVoiced && detFrame) {
        const centsDiff = 1200 * Math.log2(detFrame.frequency / tFrame.frequency);
        const absCents = Math.abs(centsDiff);
        centsErrors.push(absCents);

        if (absCents <= 50) {
          voicedWithin50Cents++;
          correctVoicingAndPitch++;
        }

        // Check if error is roughly 1 or 2 octaves (octave doubling/halving)
        const isOctaveError =
          Math.abs(absCents - 1200) < 50 ||
          Math.abs(absCents - 2400) < 50;
        if (isOctaveError) {
          octaveErrors++;
        }
      }
    } else {
      totalUnvoiced++;
      if (!detVoiced) {
        correctVoicingAndPitch++;
      }
    }
  }

  centsErrors.sort((a, b) => a - b);
  const medianCents = centsErrors.length > 0 ? centsErrors[Math.floor(centsErrors.length / 2)] : 0;
  const rawPitchAccuracy = totalVoiced > 0 ? (voicedWithin50Cents / totalVoiced) * 100 : 0;
  const totalFrames = truthFrames.length || 1;
  const overallPitchAccuracy = (correctVoicingAndPitch / totalFrames) * 100;
  const octaveErrorRate = totalVoiced > 0 ? (octaveErrors / totalVoiced) * 100 : 0;

  // Evaluate Note Segmentation and Swara Recognition
  const truthNotes = groundTruth.notes;
  let matchedNotes = 0;
  let correctLabels = 0;
  const onsetErrorsMs: number[] = [];
  const matchedTruthIndices = new Set<number>();

  for (const detNote of detectedNotes) {
    let bestTruthIdx = -1;
    let minOnsetError = Infinity;

    for (let i = 0; i < truthNotes.length; i++) {
      if (matchedTruthIndices.has(i)) continue;
      const tNote = truthNotes[i];
      const onsetDiff = Math.abs(detNote.startTime - tNote.startTime);
      if (onsetDiff <= onsetToleranceSec && onsetDiff < minOnsetError) {
        minOnsetError = onsetDiff;
        bestTruthIdx = i;
      }
    }

    if (bestTruthIdx !== -1) {
      matchedNotes++;
      matchedTruthIndices.add(bestTruthIdx);
      onsetErrorsMs.push(minOnsetError * 1000);

      const tNote = truthNotes[bestTruthIdx];
      if (detNote.swara === tNote.swara && (detNote.octave ?? 0) === tNote.octave) {
        correctLabels++;
      }
    }
  }

  const notePrecision = detectedNotes.length > 0 ? matchedNotes / detectedNotes.length : 0;
  const noteRecall = truthNotes.length > 0 ? matchedNotes / truthNotes.length : 0;
  const noteF1 =
    notePrecision + noteRecall > 0
      ? (2 * notePrecision * noteRecall) / (notePrecision + noteRecall)
      : 0;

  onsetErrorsMs.sort((a, b) => a - b);
  const onsetMedianErrorMs =
    onsetErrorsMs.length > 0 ? onsetErrorsMs[Math.floor(onsetErrorsMs.length / 2)] : 0;
  const swaraLabelAccuracy = matchedNotes > 0 ? (correctLabels / matchedNotes) * 100 : 0;

  return {
    totalVoicedFrames: totalVoiced,
    totalUnvoicedFrames: totalUnvoiced,
    medianCentsError: Number(medianCents.toFixed(2)),
    rawPitchAccuracy: Number(rawPitchAccuracy.toFixed(2)),
    overallPitchAccuracy: Number(overallPitchAccuracy.toFixed(2)),
    octaveErrorRate: Number(octaveErrorRate.toFixed(2)),
    notePrecision: Number(notePrecision.toFixed(3)),
    noteRecall: Number(noteRecall.toFixed(3)),
    noteF1: Number(noteF1.toFixed(3)),
    onsetMedianErrorMs: Number(onsetMedianErrorMs.toFixed(1)),
    swaraLabelAccuracy: Number(swaraLabelAccuracy.toFixed(2)),
  };
}

function findClosestFrame(frames: PitchFrame[], targetTime: number): PitchFrame | null {
  if (frames.length === 0) return null;
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].time < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idx1 = Math.max(0, Math.min(frames.length - 1, low));
  const idx2 = Math.max(0, Math.min(frames.length - 1, high));
  return Math.abs(frames[idx1].time - targetTime) < Math.abs(frames[idx2].time - targetTime)
    ? frames[idx1]
    : frames[idx2];
}
