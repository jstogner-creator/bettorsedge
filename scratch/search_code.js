import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2777\\content.md';
const content = fs.readFileSync(path, 'utf8');

// Let's search for "Season" (with double quotes) or similar translation keys
function findTextMatches(regex) {
  console.log(`\n--- Searching for regex ${regex} ---`);
  let match;
  let count = 0;
  while ((match = regex.exec(content)) !== null) {
    count++;
    const start = Math.max(0, match.index - 250);
    const end = Math.min(content.length, match.index + match[0].length + 250);
    console.log(`Match ${count} at index ${match.index}:`);
    console.log("...", content.substring(start, end).replace(/\n/g, ' '), "...");
    if (count >= 15) break;
  }
}

// Search for "Season" translation or season list header generation
findTextMatches(/\"Season\b/g);
findTextMatches(/season-list|seasons-list|collapsible|accordion/g);
findTextMatches(/data-season/g);
