/**
 * Unit tests for Phase 3: Note Synchronizer (Two-Way Interactive Recalculation).
 */

import { recalculateTranscriptionFromEvents } from '../noteSynchronizer';
import { parseMusicCell } from '../../sargam_parser';
import type { TranscribedNoteEvent } from '../types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

console.log('--- Testing Phase 3: Note Synchronizer ---');

const baseEvents: TranscribedNoteEvent[] = [
  {
    id: 'e1',
    startTime: 0.0,
    endTime: 0.6,
    durationSeconds: 0.6,
    swara: 'G',
    octave: 0,
    medianFrequencyHz: 370,
    centsFromSa: 400,
    confidence: 0.9,
    pitchContour: [],
  },
  {
    id: 'e2',
    startTime: 0.6,
    endTime: 1.2,
    durationSeconds: 0.6,
    swara: 'R',
    octave: 0,
    medianFrequencyHz: 330,
    centsFromSa: 200,
    confidence: 0.85,
    pitchContour: [],
  },
  {
    id: 'e3',
    startTime: 1.2,
    endTime: 1.8,
    durationSeconds: 0.6,
    swara: 'S',
    octave: 0,
    medianFrequencyHz: 293.66,
    centsFromSa: 0,
    confidence: 0.95,
    pitchContour: [],
  },
];

// Test 1: Basic Recalculation
console.log('Test 1: Recalculates sargam-v1 tokens from events...');
const res1 = recalculateTranscriptionFromEvents(
  baseEvents,
  [],
  'D4',
  293.66,
  {
    bpm: 50,
    talaId: 'tintal',
    pickupBeat: 1,
    gridResolution: 0.5,
  }
);

assert(res1.notes.length === 3, `Expected 3 notes, got ${res1.notes.length}`);
assert(res1.notes[0].swara === 'G', 'First note is G');
assert(res1.notes[0].token === 'G:0.5', `Expected G:0.5, got ${res1.notes[0].token}`);
assert(res1.sargamCode.includes('@sa D4'), 'Contains @sa D4');
assert(res1.sargamCode.includes('@tempo 50'), 'Contains @tempo 50');

// Test 2: Modify Swara & Add Meend Ornament
console.log('Test 2: Modifying swara and adding meend updates tokens in real-time...');
const modifiedEvents: TranscribedNoteEvent[] = [
  {
    ...baseEvents[0],
    swara: 'P', // changed G -> P
    ornament: {
      type: 'meend',
      targetSwara: 'D',
    },
  },
  baseEvents[1],
  baseEvents[2],
];

const res2 = recalculateTranscriptionFromEvents(
  modifiedEvents,
  [],
  'D4',
  293.66,
  {
    bpm: 50,
    talaId: 'tintal',
    pickupBeat: 1,
    gridResolution: 0.5,
    ragaId: 'yaman',
  }
);

assert(res2.notes[0].swara === 'P', 'First note updated to P');
assert(
  res2.notes[0].token.includes('+meend(D)'),
  `Expected +meend(D) in token, got ${res2.notes[0].token}`
);
assert(res2.sargamCode.includes('@raga Raag Yaman'), 'Contains @raga directive');

// Test 3: Parse compatibility
console.log('Test 3: parseMusicCell parses recalculated notation without errors...');
const parsed = parseMusicCell(res2.sargamCode.split('\n'));
assert(parsed.directives.sa === 'D4', 'Parsed @sa is D4');
assert(parsed.directives.raga === 'Raag Yaman', 'Parsed @raga is Raag Yaman');

// Test 4: Free / Event-Driven Notation Recalculation
console.log('Test 4: Free / Event-Driven natural duration recalculation...');
const res4 = recalculateTranscriptionFromEvents(
  baseEvents,
  [],
  'D4',
  293.66,
  {
    bpm: 50,
    quantizationMode: 'free',
    instrument: 'vocal',
  }
);
assert(res4.notes.length === 3, `Expected 3 free notes, got ${res4.notes.length}`);
assert(res4.notes[0].durationBeats === 0.5, 'First note naturally 0.5 beats');
assert(res4.sargamCode.includes('||'), 'Contains phrase terminal ||');

// Test 5: Flexible Mode Hold Merging
console.log('Test 5: Flexible mode merges held notes without artificial chopping...');
const heldEvents: TranscribedNoteEvent[] = [
  {
    id: 'h1',
    startTime: 0.0,
    endTime: 1.2,
    durationSeconds: 1.2, // 1 full beat at 50 bpm (beatSec = 1.2s)
    swara: 'S',
    octave: 0,
    medianFrequencyHz: 293.66,
    centsFromSa: 0,
    confidence: 0.95,
    pitchContour: [],
  },
];
const res5 = recalculateTranscriptionFromEvents(
  heldEvents,
  [],
  'D4',
  293.66,
  {
    bpm: 50,
    talaId: 'tintal',
    pickupBeat: 1,
    gridResolution: 0.5,
    quantizationMode: 'flexible',
    instrument: 'vocal',
  }
);
assert(res5.notes.length === 1, `Expected 1 merged note, got ${res5.notes.length}`);
assert(res5.notes[0].durationBeats === 1.0, `Expected duration 1.0, got ${res5.notes[0].durationBeats}`);
assert(res5.notes[0].token === 'S', `Expected token S (no :1 suffix), got ${res5.notes[0].token}`);

console.log('All Phase 3 Note Synchronizer tests passed successfully!');
