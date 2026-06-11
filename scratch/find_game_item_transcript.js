import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(path, 'utf8');

console.log("File content length:", content.length);
let idx = 0;
let count = 0;
while (true) {
  idx = content.indexOf('game-item', idx);
  if (idx === -1) break;
  count++;
  console.log(`\n=== Occurrence ${count} at index ${idx} ===`);
  console.log(content.substring(idx - 150, idx + 450));
  idx += 9;
  if (count >= 10) break;
}
