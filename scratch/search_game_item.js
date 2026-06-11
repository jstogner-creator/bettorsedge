import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2777\\content.md';
const content = fs.readFileSync(path, 'utf8');

function searchAround(query, chars = 400) {
  console.log(`\n=== Searching around "${query}" ===`);
  let index = 0;
  let count = 0;
  while ((index = content.indexOf(query, index)) !== -1) {
    count++;
    const start = Math.max(0, index - chars);
    const end = Math.min(content.length, index + query.length + chars);
    console.log(`Match ${count} at index ${index}:`);
    console.log("...", content.substring(start, end).replace(/\n/g, ' '), "...");
    index += query.length;
    if (count >= 10) break;
  }
}

searchAround("class ne extends HTMLElement{");
searchAround("initializeGame(");
searchAround("score-home");
