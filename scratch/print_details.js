import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(path, 'utf8');

function findAndPrint(query, count = 2) {
  let idx = 0;
  let matches = 0;
  while ((idx = content.indexOf(query, idx)) !== -1) {
    matches++;
    if (matches === 2) {
      console.log(`\n=== MATCH ${matches} FOR "${query}" AT INDEX ${idx} ===`);
      console.log(content.substring(idx - 100, idx + 2500));
    }
    idx += query.length;
    if (matches >= count) break;
  }
}

findAndPrint("renderStyle1(){");
