import { parseMusicCell } from './frontend/src/utils/sargam_parser.ts';
import fs from 'fs';

const testCases = JSON.parse(fs.readFileSync('cross_language_tests.json', 'utf8')) as string[];

const results = testCases.map((testString: string) => {
  return parseMusicCell(testString.split('\n'));
});

fs.writeFileSync('typescript_results.json', JSON.stringify(results, null, 2));
