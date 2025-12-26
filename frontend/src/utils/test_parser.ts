// Test script to check parser output
import { parseMusicCell } from './sargam_parser';

const testInput = "S G P+meend(S) S+meend(P, 0.2, 0.6, 0.2) . ||";
const lines = [testInput];

console.log("Input:", testInput);
console.log("\n=== PARSED OUTPUT ===\n");
const result = parseMusicCell(lines);
console.log(JSON.stringify(result, null, 2));

console.log("\n=== DETAILED EVENTS ===\n");
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

