/**
 * Unit tests for Tonic Candidate Ranking & Sub-Cent Tuning.
 */

import { detectSaFromAudio, noteToFrequency } from '../tonicDetector';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

console.log('--- Testing Sa Candidate Ranking ---');

// Synthesize a 2-second audio buffer with dominant D4 (293.66 Hz) and Pa A4 (440 Hz) drone
const sampleRate = 44100;
const totalSamples = sampleRate * 2;
const buffer = new Float32Array(totalSamples);
const fSa = 293.66; // D4
const fPa = 440.0;  // A4

for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate;
  buffer[i] =
    0.6 * Math.sin(2 * Math.PI * fSa * t) +
    0.4 * Math.sin(2 * Math.PI * fPa * t);
}

const detected = detectSaFromAudio(buffer, sampleRate);

console.log('Top detected tonic:', detected.pitch, 'confidence:', detected.confidence);
console.log('Ranked candidates count:', detected.candidates.length);
detected.candidates.forEach((c, idx) => {
  console.log(`  Candidate ${idx + 1}: ${c.pitch} (${c.frequency} Hz) - ${c.confidence * 100}% - ${c.reason}`);
});

assert(detected.note === 'D', `Expected primary note D, got ${detected.note}`);
assert(detected.candidates.length >= 3, 'Should return at least 3 ranked candidates');
assert(detected.candidates[0].note === 'D', 'Candidate 1 should be D');
assert(
  detected.candidates.some((c) => c.note === 'A'),
  'Should include A (Pa) as one of the ranked candidates with harmonic correlation'
);

console.log('All Tonic Candidate tests passed successfully!');
