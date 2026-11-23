/**
 * Full Dataset Benchmark Runner:
 * Evaluates Baseline YIN vs Improved pYIN across authentic Saraga Hindustani master tracks
 * and acoustic sitar reference recordings.
 * Gathers international MIREX metrics, transcribes sample Sargam phrases,
 * and exports a publication-grade PDF report.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { YinPitchDetector } from '../pitchDetector';
import { PYinPitchDetector } from '../pitch/pyinDetector';
import {
  loadSaragaBenchmark,
  createSitarGatBenchmark,
  createRealSitarBenchmark,
} from './audioReferenceDatasets';
import { evaluatePitchAndNotes } from './evaluator';
import { transcribeAudioToSargam } from '../sargamTranscriber';

const DATASET_ROOT = path.resolve(
  __dirname,
  '../../../../../benchmark_data/saraga/saraga1.5_hindustani'
);

interface TrackTarget {
  name: string;
  artist: string;
  dir?: string;
  track?: string;
  isCustom?: boolean;
  generator?: () => any;
  durationSec?: number;
}

const BENCHMARK_TRACKS: TrackTarget[] = [
  {
    name: 'Raag Yaman (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Yaman',
    track: 'Raag Yaman',
    durationSec: 25,
  },
  {
    name: 'Raag Bhoopali (Bandish)',
    artist: 'Omkar Dadarkar',
    dir: 'Raag Bhoopali & Gavti by Omkar Dadarkar/Raag Bhoopali',
    track: 'Raag Bhoopali',
    durationSec: 25,
  },
  {
    name: 'Raag Desh (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Desh',
    track: 'Raag Desh',
    durationSec: 25,
  },
  {
    name: 'Raag Bhairav (Khayal)',
    artist: 'Kumar Gandharva',
    dir: 'Raag Bhairav & Dhani by Kumar Gandharva/Raag Bhairav',
    track: 'Raag Bhairav',
    durationSec: 25,
  },
  {
    name: 'Raag Kedar (Khayal)',
    artist: 'Ajoy Chakrabarty',
    dir: 'Raag Kedar & Jog by Ajoy Chakrabarty/Raag Kedar',
    track: 'Raag Kedar',
    durationSec: 25,
  },
  {
    name: 'Raag Jog (Khayal)',
    artist: 'Ajoy Chakrabarty',
    dir: 'Raag Kedar & Jog by Ajoy Chakrabarty/Raag Jog',
    track: 'Raag Jog',
    durationSec: 25,
  },
  {
    name: 'Raag Bageshree',
    artist: 'Satyasheel Deshpande',
    dir: 'Raag Bageshree & Bhairavi Bhajan by Satyasheel Deshpande/Raag Bageshree',
    track: 'Raag Bageshree',
    durationSec: 25,
  },
  {
    name: 'Raag Lalit (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Lalit',
    track: 'Raag Lalit',
    durationSec: 25,
  },
  {
    name: 'Raag Marwa (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Marwa',
    track: 'Raag Marwa',
    durationSec: 25,
  },
  {
    name: 'Raag Bilaskhani Todi',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Bilaskhani Todi',
    track: 'Raag Bilaskhani Todi',
    durationSec: 25,
  },
  {
    name: 'Raag Madhukauns (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Madhukauns',
    track: 'Raag Madhukauns',
    durationSec: 25,
  },
  {
    name: 'Raag Miyan Malhar',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Miyan Malhar',
    track: 'Raag Miyan Malhar',
    durationSec: 25,
  },
  {
    name: 'Raag Puriya Dhanashree',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Hindustani Alaps by Kaustuv Kanti Ganguli/Raag Puriya Dhanashree',
    track: 'Raag Puriya Dhanashree',
    durationSec: 25,
  },
  {
    name: 'Raag Shree (Alap)',
    artist: 'Kaustuv Kanti Ganguli',
    dir: 'Raag Shree by Kaustuv Kanti Ganguli/Raag Shree',
    track: 'Raag Shree',
    durationSec: 25,
  },
  {
    name: 'Raag Todi (Khayal)',
    artist: 'Omkar Dadarkar',
    dir: 'Raag Ahir Bhairon & Todi by Omkar Dadarkar/Raag Todi',
    track: 'Raag Todi',
    durationSec: 25,
  },
  {
    name: 'Raag Abhogi (Khayal)',
    artist: 'Ajoy Chakrabarty',
    dir: 'Raag Abhogi, Rageshree & Khamaj by Ajoy Chakrabarty/Raag Abhogi',
    track: 'Raag Abhogi',
    durationSec: 25,
  },
  {
    name: 'Raag Khamaj (Thumri)',
    artist: 'Ajoy Chakrabarty',
    dir: 'Raag Abhogi, Rageshree & Khamaj by Ajoy Chakrabarty/Raag Khamaj',
    track: 'Raag Khamaj',
    durationSec: 25,
  },
  {
    name: 'Raag Kalavati',
    artist: 'Ajoy Chakrabarty',
    dir: 'Geetinandan : Part-3 by Ajoy Chakrabarty/Kalavati',
    track: 'Kalavati',
    durationSec: 25,
  },
  {
    name: 'Raag Shuddha Kalyan',
    artist: 'Ajoy Chakrabarty',
    dir: 'Geetinandan : Part-3 by Ajoy Chakrabarty/Sudh Kalyan',
    track: 'Sudh Kalyan',
    durationSec: 25,
  },
  {
    name: 'Raag Bihag (Khayal)',
    artist: 'Omkar Dadarkar',
    dir: 'Raag Bihag & Bhairavi Dadra by Omkar Dadarkar/Raag Bihag',
    track: 'Raag Bihag',
    durationSec: 25,
  },
  {
    name: 'Sitar Gat Phrase (Tintal)',
    artist: 'Physical Acoustic Sitar Model',
    isCustom: true,
    generator: createSitarGatBenchmark,
  },
  {
    name: 'Real Acoustic Sitar Pluck',
    artist: 'Acoustic Studio Recording',
    isCustom: true,
    generator: createRealSitarBenchmark,
  },
];

async function runBenchmark() {
  console.log('================================================================================');
  console.log('       SARGAM-V1 FULL DATASET BENCHMARK & PDF GENERATION SUITE                 ');
  console.log('================================================================================\n');

  let gitCommit = 'unknown';
  let gitBranch = 'main';
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {}

  console.log(`Git Commit: ${gitCommit}`);
  console.log(`Git Branch: ${gitBranch}\n`);

  const results: any[] = [];
  const overallStart = performance.now();

  for (let idx = 0; idx < BENCHMARK_TRACKS.length; idx++) {
    const item = BENCHMARK_TRACKS[idx];
    console.log(`[${idx + 1}/${BENCHMARK_TRACKS.length}] Processing: ${item.name} (${item.artist})...`);

    let dataset;
    if (item.isCustom && item.generator) {
      dataset = item.generator();
    } else {
      const fullDir = path.join(DATASET_ROOT, item.dir!);
      dataset = loadSaragaBenchmark(fullDir, item.track!, item.durationSec || 25);
    }

    const samples = dataset.audioSamples!;
    const sampleRate = dataset.sampleRate!;
    const durSec = dataset.durationSeconds;

    // 1. Baseline YIN
    const yin = new YinPitchDetector({
      sampleRate,
      frameSize: 2048,
      hopSize: 512,
      threshold: 0.15,
      clarityThreshold: 0.40,
      silenceThreshold: 0.005,
    });
    const yinStart = performance.now();
    const yinFrames = yin.analyze(samples);
    const yinTimeMs = performance.now() - yinStart;
    const yinMetrics = evaluatePitchAndNotes(dataset, yinFrames, []);

    // 2. Improved pYIN
    const pyin = new PYinPitchDetector({
      sampleRate,
      frameSize: 2048,
      hopSize: 512,
      clarityThreshold: 0.40,
      silenceThreshold: 0.005,
    });
    const pyinStart = performance.now();
    const pyinFrames = pyin.analyze(samples);
    const pyinTimeMs = performance.now() - pyinStart;
    const pyinMetrics = evaluatePitchAndNotes(dataset, pyinFrames, []);

    // 3. Sargam Notation Transcriber (Natural / Free Durations)
    const instrumentType = item.isCustom ? 'sitar' : 'vocal';
    const transcription = transcribeAudioToSargam(
      samples,
      sampleRate,
      dataset.saPitch,
      dataset.saFrequency,
      {
        instrument: instrumentType,
        quantizationMode: 'free',
        algorithm: 'pyin',
      }
    );

    const sargamTokens = transcription.notes.slice(0, 10).map((n) => n.token).join(' ');

    const trackResult = {
      name: item.name,
      artist: item.artist,
      saFreq: dataset.saFrequency,
      durationSec: durSec,
      yinRPA: yinMetrics.rawPitchAccuracy,
      yinRCA: yinMetrics.rawChromaAccuracy,
      yinOA: yinMetrics.overallPitchAccuracy,
      yinVR: yinMetrics.voicingRecall,
      yinVFA: yinMetrics.voicingFalseAlarm,
      yinMCE: yinMetrics.medianCentsError,
      yinOCR: yinMetrics.octaveErrorRate,
      yinTimeMs,
      pyinRPA: pyinMetrics.rawPitchAccuracy,
      pyinRCA: pyinMetrics.rawChromaAccuracy,
      pyinOA: pyinMetrics.overallPitchAccuracy,
      pyinVR: pyinMetrics.voicingRecall,
      pyinVFA: pyinMetrics.voicingFalseAlarm,
      pyinMCE: pyinMetrics.medianCentsError,
      pyinOCR: pyinMetrics.octaveErrorRate,
      pyinTimeMs,
      rtf: durSec / (pyinTimeMs / 1000),
      sargamSample: sargamTokens,
    };

    results.push(trackResult);
    const rpaDiff = (trackResult.pyinRPA - trackResult.yinRPA).toFixed(1);
    const rpaSign = Number(rpaDiff) >= 0 ? '+' : '';
    console.log(
      `   -> pYIN RPA: ${trackResult.pyinRPA.toFixed(1)}% (${rpaSign}${rpaDiff}%), RCA: ${trackResult.pyinRCA.toFixed(1)}%, OA: ${trackResult.pyinOA.toFixed(1)}%, OCR: ${trackResult.pyinOCR.toFixed(1)}% | RTF: ${trackResult.rtf.toFixed(1)}x`
    );
  }

  // Aggregated Measures
  const N = results.length;
  const agg = {
    yinMeanRPA: results.reduce((s, r) => s + r.yinRPA, 0) / N,
    pyinMeanRPA: results.reduce((s, r) => s + r.pyinRPA, 0) / N,
    yinMeanRCA: results.reduce((s, r) => s + r.yinRCA, 0) / N,
    pyinMeanRCA: results.reduce((s, r) => s + r.pyinRCA, 0) / N,
    yinMeanOA: results.reduce((s, r) => s + r.yinOA, 0) / N,
    pyinMeanOA: results.reduce((s, r) => s + r.pyinOA, 0) / N,
    yinMeanVR: results.reduce((s, r) => s + r.yinVR, 0) / N,
    pyinMeanVR: results.reduce((s, r) => s + r.pyinVR, 0) / N,
    yinMeanVFA: results.reduce((s, r) => s + r.yinVFA, 0) / N,
    pyinMeanVFA: results.reduce((s, r) => s + r.pyinVFA, 0) / N,
    yinMeanMCE: results.reduce((s, r) => s + r.yinMCE, 0) / N,
    pyinMeanMCE: results.reduce((s, r) => s + r.pyinMCE, 0) / N,
    yinMeanOCR: results.reduce((s, r) => s + r.yinOCR, 0) / N,
    pyinMeanOCR: results.reduce((s, r) => s + r.pyinOCR, 0) / N,
    meanRTF: results.reduce((s, r) => s + r.rtf, 0) / N,
  };

  const totalTimeSec = ((performance.now() - overallStart) / 1000).toFixed(1);

  console.log('\n================================================================================');
  console.log('                          AGGREGATED BENCHMARK SUMMARY                          ');
  console.log('================================================================================');
  console.log(`Evaluated Tracks:      ${N}`);
  console.log(`Execution Time:        ${totalTimeSec}s`);
  console.log(`Mean Raw Pitch Acc:    Baseline YIN: ${agg.yinMeanRPA.toFixed(2)}% | Improved pYIN: ${agg.pyinMeanRPA.toFixed(2)}%`);
  console.log(`Mean Raw Chroma Acc:   Baseline YIN: ${agg.yinMeanRCA.toFixed(2)}% | Improved pYIN: ${agg.pyinMeanRCA.toFixed(2)}%`);
  console.log(`Mean Overall Accuracy: Baseline YIN: ${agg.yinMeanOA.toFixed(2)}% | Improved pYIN: ${agg.pyinMeanOA.toFixed(2)}%`);
  console.log(`Mean False Alarm (VFA):Baseline YIN: ${agg.yinMeanVFA.toFixed(2)}% | Improved pYIN: ${agg.pyinMeanVFA.toFixed(2)}% (-${(agg.yinMeanVFA - agg.pyinMeanVFA).toFixed(2)}%)`);
  console.log(`Mean Octave Error Rate:Baseline YIN: ${agg.yinMeanOCR.toFixed(2)}% | Improved pYIN: ${agg.pyinMeanOCR.toFixed(2)}%`);
  console.log('================================================================================\n');

  const exportPayload = {
    gitCommit,
    gitBranch,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    aggregated: agg,
    tracks: results,
  };

  const jsonTempPath = '/tmp/saraga_benchmark_results.json';
  fs.writeFileSync(jsonTempPath, JSON.stringify(exportPayload, null, 2));

  const pdfOutputPath = path.resolve(process.cwd(), 'Saraga_Hindustani_Benchmark_Report.pdf');
  console.log(`Generating PDF Report via ReportLab...`);
  try {
    const pythonScript = path.resolve(process.cwd(), 'scripts/generate_benchmark_pdf.py');
    execSync(`python3 "${pythonScript}" "${jsonTempPath}" "${pdfOutputPath}"`, { stdio: 'inherit' });
    console.log(`\nPDF Report successfully saved to: ${pdfOutputPath}`);
  } catch (err) {
    console.error('Failed to generate PDF:', err);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
