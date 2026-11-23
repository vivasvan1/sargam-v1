/**
 * Unit tests for Phase 2: Raga Scorer & Music-Aware Interpretation.
 */

import { RAGA_PRESETS } from '../raga/ragaDefinitions';
import { applyRagaCorrection } from '../raga/ragaScorer';
import { transcribeAudioToSargam } from '../sargamTranscriber';
import { parseMusicCell } from '../../sargam_parser';
import type { TranscribedNoteEvent } from '../types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

console.log('--- Testing Phase 2: Raga Scorer & Ornaments ---');

// Test 1: Raga Durga Varjit Ga suppression
console.log('Test 1: Raag Durga suppresses spurious Ga during Ma-to-Re transition...');
const ragaDurga = RAGA_PRESETS['durga'];
assert(!!ragaDurga, 'Raag Durga must be defined');
assert(ragaDurga.varjitSwaras.includes('G'), 'Ga must be varjit in Durga');

// Simulate notes: m (500ms) -> spurious G (120ms passing) -> R (500ms)
const simulatedDurgaNotes: TranscribedNoteEvent[] = [
  {
    id: 'n1',
    startTime: 0.0,
    endTime: 0.5,
    durationSeconds: 0.5,
    swara: 'm',
    octave: 0,
    medianFrequencyHz: 392,
    centsFromSa: 500,
    confidence: 0.9,
    pitchContour: [],
  },
  {
    id: 'n2',
    startTime: 0.5,
    endTime: 0.62,
    durationSeconds: 0.12,
    swara: 'G', // spurious transient in meend
    octave: 0,
    medianFrequencyHz: 370,
    centsFromSa: 400,
    confidence: 0.45,
    pitchContour: [],
  },
  {
    id: 'n3',
    startTime: 0.62,
    endTime: 1.12,
    durationSeconds: 0.5,
    swara: 'R',
    octave: 0,
    medianFrequencyHz: 330,
    centsFromSa: 200,
    confidence: 0.88,
    pitchContour: [],
  },
];

const corrected = applyRagaCorrection(simulatedDurgaNotes, ragaDurga, 293.66);
console.log('Corrected notes count:', corrected.length);
assert(corrected.length === 2, `Passing varjit Ga should be absorbed into meend, got ${corrected.length} notes`);
assert(corrected[0].swara === 'm', 'First note is m');
assert(corrected[0].ornament?.type === 'meend', 'First note must have meend ornament');
assert(corrected[0].ornament?.targetSwara === 'R', 'Meend target must be R');
assert(corrected[1].swara === 'R', 'Second note is R');

// Test 2: Raga Yaman allows Tivra Ma (Mt) and Vadi G confidence boost
console.log('Test 2: Raag Yaman allows Tivra Ma and boosts Vadi/Samvadi...');
const ragaYaman = RAGA_PRESETS['yaman'];
const simulatedYamanNotes: TranscribedNoteEvent[] = [
  {
    id: 'y1',
    startTime: 0.0,
    endTime: 0.5,
    durationSeconds: 0.5,
    swara: 'G', // Vadi
    octave: 0,
    medianFrequencyHz: 370,
    centsFromSa: 400,
    confidence: 0.8,
    pitchContour: [],
  },
  {
    id: 'y2',
    startTime: 0.5,
    endTime: 1.0,
    durationSeconds: 0.5,
    swara: 'Mt', // Allowed in Yaman
    octave: 0,
    medianFrequencyHz: 415,
    centsFromSa: 600,
    confidence: 0.75,
    pitchContour: [],
  },
];

const correctedYaman = applyRagaCorrection(simulatedYamanNotes, ragaYaman, 293.66);
assert(correctedYaman[0].confidence > 0.8, 'Vadi G should receive confidence boost');
assert(correctedYaman[1].swara === 'Mt', 'Tivra Ma must be preserved in Yaman');

// Test 3: Generated Sargam token parsing with +meend(...)
console.log('Test 3: parseMusicCell compatibility with +meend and @raga directives...');
const testSargamLines = [
  '@sa D4',
  '@raga Raag Yaman',
  '@tempo 50',
  '',
  'G:0.5+meend(P) P:0.5 Mt:0.5 D:0.5 |',
];

const parsedCell = parseMusicCell(testSargamLines);
assert(parsedCell.directives.raga === 'Raag Yaman', 'Parsed @raga is Raag Yaman');
const voiceEvents = Object.values(parsedCell.voices)[0]?.events || [];
const note1 = voiceEvents.find((e) => e.type === 'note') as any;
assert(note1.swara === 'G', 'Note 1 swara is G');
assert(note1.ornaments.length === 1, 'Note 1 has 1 ornament');
assert(note1.ornaments[0].name === 'meend', 'Ornament is meend');
assert(note1.ornaments[0].params[0] === 'P', 'Meend target parameter is P');

console.log('All Phase 2 Raga & Ornament tests passed successfully!');
