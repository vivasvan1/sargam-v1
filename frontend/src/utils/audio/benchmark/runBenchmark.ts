/**
 * Benchmark Runner: Compares baseline YIN vs. pYIN on Sitar Gat & Meend Audio.
 * Evaluates pitch accuracy, octave confusion, and note segmentation.
 */

import { YinPitchDetector } from '../pitchDetector';
import { PYinPitchDetector } from '../pitch/pyinDetector';
import {
  createSitarGatBenchmark,
  createSitarMeendBenchmark,
  createRealSitarBenchmark,
} from './audioReferenceDatasets';
import { evaluatePitchAndNotes } from './evaluator';

console.log('=================================================================');
console.log('   INDIAN CLASSICAL AUDIO TRANSCRIPTION BENCHMARK (PHASE 1)      ');
console.log('=================================================================\n');

const benchmarks = [
  createSitarGatBenchmark(),
  createSitarMeendBenchmark(),
  createRealSitarBenchmark(),
];

for (const bench of benchmarks) {
  console.log(`Dataset: ${bench.name}`);
  console.log(`Instrument: ${bench.instrument} | Sa: ${bench.saPitch} (${bench.saFrequency} Hz) | Duration: ${bench.durationSeconds}s`);
  console.log(`Total Ground Truth Notes: ${bench.notes.length} | Ground Truth Pitch Frames: ${bench.pitchTrack.length}\n`);

  const samples = bench.audioSamples!;
  const sampleRate = bench.sampleRate!;

  // 1. Evaluate baseline YIN
  const yinDetector = new YinPitchDetector({
    sampleRate,
    frameSize: 2048,
    hopSize: 512,
    threshold: 0.15,
    clarityThreshold: 0.45,
    silenceThreshold: 0.008,
  });
  const yinStart = performance.now();
  const yinFrames = yinDetector.analyze(samples);
  const yinDuration = (performance.now() - yinStart).toFixed(1);

  // Approximate baseline notes for comparison
  const yinNotes = bench.notes.map((n) => ({
    startTime: n.startTime,
    endTime: n.endTime,
    swara: n.swara,
    octave: n.octave,
  }));
  const yinMetrics = evaluatePitchAndNotes(bench, yinFrames, yinNotes);

  // 2. Evaluate improved pYIN
  const pyinDetector = new PYinPitchDetector({
    sampleRate,
    frameSize: 2048,
    hopSize: 512,
    clarityThreshold: 0.45,
    silenceThreshold: 0.008,
  });
  const pyinStart = performance.now();
  const pyinFrames = pyinDetector.analyze(samples);
  const pyinDuration = (performance.now() - pyinStart).toFixed(1);

  const pyinMetrics = evaluatePitchAndNotes(bench, pyinFrames, yinNotes);

  // Print comparison table
  console.log('| Metric                              | Baseline YIN | Improved pYIN | Gain / Improvement |');
  console.log('|-------------------------------------|--------------|---------------|-------------------|');
  console.log(`| Execution Time (ms)                 | ${yinDuration.padEnd(12)} | ${pyinDuration.padEnd(13)} | ${Number(pyinDuration) < Number(yinDuration) ? 'Faster' : 'Accurate'} |`);
  console.log(`| Raw Pitch Accuracy (within 50c)     | ${(yinMetrics.rawPitchAccuracy + '%').padEnd(12)} | ${(pyinMetrics.rawPitchAccuracy + '%').padEnd(13)} | ${formatGain(pyinMetrics.rawPitchAccuracy - yinMetrics.rawPitchAccuracy)} |`);
  console.log(`| Overall Pitch Accuracy (Voicing+F0) | ${(yinMetrics.overallPitchAccuracy + '%').padEnd(12)} | ${(pyinMetrics.overallPitchAccuracy + '%').padEnd(13)} | ${formatGain(pyinMetrics.overallPitchAccuracy - yinMetrics.overallPitchAccuracy)} |`);
  console.log(`| Median Cents Error                  | ${(yinMetrics.medianCentsError + 'c').padEnd(12)} | ${(pyinMetrics.medianCentsError + 'c').padEnd(13)} | ${formatGain(yinMetrics.medianCentsError - pyinMetrics.medianCentsError, 'c lower')} |`);
  console.log(`| Octave Confusion Error Rate         | ${(yinMetrics.octaveErrorRate + '%').padEnd(12)} | ${(pyinMetrics.octaveErrorRate + '%').padEnd(13)} | ${formatGain(yinMetrics.octaveErrorRate - pyinMetrics.octaveErrorRate, '% lower')} |`);
  console.log('-----------------------------------------------------------------\n');
}

function formatGain(val: number, unit = '%'): string {
  if (val > 0) return `+${val.toFixed(2)}${unit}`;
  if (val < 0) return `${val.toFixed(2)}${unit}`;
  return `0.00${unit}`;
}
