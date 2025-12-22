import { parseMusicCell } from './sargam_parser.ts';

const testInput = [
  '#voice melody',
  'G M P D | N S\' S\':0.5 .:0.5 . | n D P M | G R S . ||'
];

const result = parseMusicCell(testInput);

for (let voiceName in result.voices) {
  console.log(`Voice: ${voiceName}, Events: ${result.voices[voiceName].events.length}`);
  result.voices[voiceName].events.forEach((ev, i) => {
    console.log(`  ${i}: type=${ev.type}, duration=${ev.duration}, swara=${ev.swara || ''}`);
  });
}
