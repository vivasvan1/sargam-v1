/**
 * Unit tests for Audio to Sargam DSP & Transcription v2.
 * Tests:
 * 1. Note & Frequency conversions
 * 2. Swara mapping with strict octave clamping (strictly -1 to 1, NO ,, or '')
 * 3. Sitar phrase transcription with beat grid (0.5), chikari (^), pickup skip (/:11), and Tala directives
 * 4. parseMusicCell compatibility with the generated sargam code
 */

import { YinPitchDetector } from '../pitchDetector';
import {
  detectSaFromAudio,
  noteToFrequency,
  frequencyToNote,
} from '../tonicDetector';
import {
  frequencyToSwara,
  formatSwaraWithOctave,
  transcribeAudioToSargam,
  TALA_PRESETS,
} from '../sargamTranscriber';
import { parseMusicCell } from '../../sargam_parser';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Running Audio Transcriber v2 Tests ---');

// 1. Note & Frequency conversions
console.log('Test 1: Note and frequency conversions...');
const d4Freq = noteToFrequency('D', 4);
assert(Math.abs(d4Freq - 293.66) < 0.1, `D4 should be ~293.66 Hz, got ${d4Freq}`);

// 2. Strict Octave Clamping (NO ,, or '')
console.log('Test 2: Octave clamping and swara mapping...');
const saD4 = 293.66; // Sa = D4

// Normal middle octave
const g4 = frequencyToSwara(noteToFrequency('F#', 4), saD4);
assert(g4.swara === 'G' && g4.octave === 0, 'F#4 with Sa=D4 must be G (octave 0)');
assert(formatSwaraWithOctave(g4.swara, g4.octave) === 'G', 'G octave 0 should format as G');

// Mandra octave (-1)
const d3 = frequencyToSwara(noteToFrequency('D', 3), saD4);
assert(d3.swara === 'S' && d3.octave === -1, 'D3 with Sa=D4 must be S, (mandra)');
assert(formatSwaraWithOctave(d3.swara, d3.octave) === 'S,', 'S mandra should format as S,');

// Extreme low frequency (simulating pitch halving / sub-contra glitch at 73 Hz)
const lowGlitch = frequencyToSwara(73.4, saD4);
assert(lowGlitch.octave >= -1, 'Octave must never go below -1 (no ,,)');
const formattedLow = formatSwaraWithOctave(lowGlitch.swara, lowGlitch.octave);
assert(!formattedLow.includes(',,'), `Should not contain ,, got: ${formattedLow}`);

// Extreme high frequency (simulating octave doubling at 1200 Hz)
const highGlitch = frequencyToSwara(1200, saD4);
assert(highGlitch.octave <= 1, 'Octave must never exceed +1 (no \'\')');
const formattedHigh = formatSwaraWithOctave(highGlitch.swara, highGlitch.octave);
assert(!formattedHigh.includes("''"), `Should not contain '' got: ${formattedHigh}`);

// 3. Vocal / Flute Melody Transcription with Tala & Pickup Beat
console.log('Test 3: Full Vocal/Flute transcription with Tintal and pickup /:11...');
const sampleRate = 44100;
const bpm = 50;
const beatSec = 60 / bpm; // 1.2s per beat
const subBeatSec = beatSec * 0.5; // 0.6s per 0.5 matra

// Synthesize a 5-beat phrase starting on Beat 12 of Tintal:
// G:0.5, G:0.5, R:0.5, R:0.5, S:0.5, S:0.5, N,:0.5, D,:0.5, N,:0.5, S:0.5
// Swaras relative to Sa = D4:
// G = F#4 (369.99 Hz)
// R = E4 (329.63 Hz)
// S = D4 (293.66 Hz)
// N, = C#4 (277.18 Hz)
// D, = B3 (246.94 Hz)
const fG = noteToFrequency('F#', 4);
const fR = noteToFrequency('E', 4);
const fS = noteToFrequency('D', 4);
const fN_ = noteToFrequency('C#', 4);
const fD_ = noteToFrequency('B', 3);

// Generate audio buffer for 10 sub-beats (5 full beats)
const totalSamples = Math.floor(sampleRate * 5 * beatSec);
const melodyBuffer = new Float32Array(totalSamples);

function fillNote(startSb: number, durSb: number, freq: number) {
  const startSample = Math.floor(startSb * subBeatSec * sampleRate);
  const durSamples = Math.floor(durSb * subBeatSec * sampleRate);
  for (let i = 0; i < durSamples && startSample + i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 15) * Math.exp(-t * 0.5); // sustained flute/vocal envelope
    melodyBuffer[startSample + i] =
      0.8 * env * Math.sin(2 * Math.PI * freq * t) +
      0.2 * env * Math.sin(2 * Math.PI * freq * 2 * t);
  }
}

// G:0.5 (slot 0)
fillNote(0, 1, fG);
// G:0.5 (slot 1)
fillNote(1, 1, fG);
// R:0.5 (slot 2)
fillNote(2, 1, fR);
// R:0.5 (slot 3)
fillNote(3, 1, fR);
// S:0.5 (slot 4)
fillNote(4, 1, fS);
// S:0.5 (slot 5)
fillNote(5, 1, fS);
// N,:0.5 (slot 6)
fillNote(6, 1, fN_);
// D,:0.5 (slot 7)
fillNote(7, 1, fD_);
// N,:0.5 (slot 8)
fillNote(8, 1, fN_);
// S:0.5 (slot 9)
fillNote(9, 1, fS);

const transcription = transcribeAudioToSargam(
  melodyBuffer,
  sampleRate,
  'D4',
  saD4,
  {
    bpm: 50,
    talaId: 'tintal',
    pickupBeat: 12,
    gridResolution: 0.5,
  }
);

console.log('Transcribed Vocal/Flute Output:');
console.log(transcription.sargamCode);

// Verification assertions
assert(transcription.sargamCode.includes('@sa D4'), 'Must have @sa D4');
assert(transcription.sargamCode.includes('@tala Tintal(16)'), 'Must have @tala Tintal(16)');
assert(transcription.sargamCode.includes('@tala_pattern'), 'Must have @tala_pattern');
assert(transcription.sargamCode.includes('@tempo 50'), 'Must have @tempo 50');
assert(transcription.sargamCode.includes('/:11'), 'Must have pickup skip /:11');
assert(!transcription.sargamCode.includes(',,'), 'Must not contain double comma ,,');
assert(!transcription.sargamCode.includes("''"), "Must not contain double apostrophe ''");
assert(!transcription.sargamCode.includes('_:0.25'), 'Must not contain fragmented _:0.25 rests');

// Parse verification
const parsed = parseMusicCell(transcription.sargamCode.split('\n'));
assert(parsed.directives.sa === 'D4', 'Parsed @sa is D4');
assert(parsed.directives.tala === 'Tintal(16)', 'Parsed @tala is Tintal(16)');

console.log('All Transcriber v2 tests passed successfully!');
