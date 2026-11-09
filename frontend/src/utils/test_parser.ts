// Test script to check parser output
import { parseMusicCell, getMusicCellTitle, type BarEvent } from './sargam_parser';

const testInput = 'S G P+meend(S) S+meend(P, 0.2, 0.6, 0.2) . ||';
const lines = [testInput];

console.log('Input:', testInput);
console.log('\n=== PARSED OUTPUT ===\n');
const result = parseMusicCell(lines);
console.log(JSON.stringify(result, null, 2));

console.log('\n=== DETAILED EVENTS ===\n');
result.voices.default.events.forEach((event, idx) => {
  console.log(`\nEvent ${idx + 1}:`);
  console.log(`  Type: ${event.type}`);
  if (event.type === 'note') {
    console.log(`  Swara: ${event.swara}`);
    console.log(`  Octave: ${event.octave}`);
    console.log(`  Variant: ${event.variant || 'none'}`);
    console.log(`  Duration: ${event.duration}`);
    console.log(`  Ornaments:`, JSON.stringify(event.ornaments, null, 4));
    if (event.lyric) {
      console.log(`  Lyric: ${event.lyric}`);
    }
  } else if (event.type === 'hold') {
    console.log(`  Duration: ${event.duration}`);
  } else if (event.type === 'rest') {
    console.log(`  Duration: ${event.duration}`);
  } else if (event.type === 'bar') {
    console.log(`  Double: ${event.double}`);
  }
});

// Test bar comments
console.log('\n=== BAR COMMENT TESTS ===\n');
const barCommentInput = [
  '@title Raag Yaman',
  'S R G M |="Sam" P D N S\' ||="Khali"',
  'S\' N D P |="End of Sthayi" M G R S ||="Tihai 1"'
];
const barResult = parseMusicCell(barCommentInput);
const barEvents = barResult.voices.default.events.filter(e => e.type === 'bar') as BarEvent[];

console.log(`Total bar events found: ${barEvents.length}`);
console.assert(barEvents.length === 4, `Expected 4 bar events, got ${barEvents.length}`);

console.assert(barEvents[0].double === false, 'First bar is single');
console.assert(barEvents[0].comment === 'Sam', `Expected "Sam", got "${barEvents[0].comment}"`);

console.assert(barEvents[1].double === true, 'Second bar is double');
console.assert(barEvents[1].comment === 'Khali', `Expected "Khali", got "${barEvents[1].comment}"`);

console.assert(barEvents[2].double === false, 'Third bar is single');
console.assert(barEvents[2].comment === 'End of Sthayi', `Expected "End of Sthayi", got "${barEvents[2].comment}"`);

console.assert(barEvents[3].double === true, 'Fourth bar is double');
console.assert(barEvents[3].comment === 'Tihai 1', `Expected "Tihai 1", got "${barEvents[3].comment}"`);

// Test cell title helper
console.log('\n=== CELL TITLE TESTS ===\n');
console.assert(getMusicCellTitle(barResult) === 'Raag Yaman', 'Extracts title from @title directive');

const commentOnlyCell = parseMusicCell(['# Vilambit Bandish', 'S R G M | P D N S\' ||']);
console.assert(getMusicCellTitle(commentOnlyCell) === 'Vilambit Bandish', 'Extracts title from first comment');

const untitledCell = parseMusicCell(['S R G M | P D N S\' ||']);
console.assert(getMusicCellTitle(untitledCell) === 'Score', 'Falls back to Score when untitled');

console.log('All bar comment & title tests passed successfully!');

