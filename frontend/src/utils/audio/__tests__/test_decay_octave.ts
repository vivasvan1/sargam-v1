import {
  TALA_PRESETS,
  frequencyToSwara,
  formatSwaraWithOctave,
} from '../sargamTranscriber';
import { noteToFrequency } from '../tonicDetector';

const saD4 = 293.66; // Sa = D4

console.log('Testing swara mapping for vocal/flute notes:');

const testNotes = [
  { name: 'G (F#4)', freq: noteToFrequency('F#', 4), expected: 'G' },
  { name: 'R (E4)', freq: noteToFrequency('E', 4), expected: 'R' },
  { name: 'S (D4)', freq: noteToFrequency('D', 4), expected: 'S' },
  { name: 'N, (C#4)', freq: noteToFrequency('C#', 4), expected: 'N,' },
  { name: 'D, (B3)', freq: noteToFrequency('B', 3), expected: 'D,' },
  { name: 'P, (A3)', freq: noteToFrequency('A', 3), expected: 'P,' },
  { name: 'Mt, (G#3)', freq: noteToFrequency('G#', 3), expected: 'Mt,' },
  { name: 'S, (D3)', freq: noteToFrequency('D', 3), expected: 'S,' },
  { name: 'R, (E3)', freq: noteToFrequency('E', 3), expected: 'R,' },
];

for (const t of testNotes) {
  const res = frequencyToSwara(t.freq, saD4);
  const formatted = formatSwaraWithOctave(res.swara, res.octave);
  console.log(`${t.name} -> detected ${formatted} (expected ${t.expected})`);
}
