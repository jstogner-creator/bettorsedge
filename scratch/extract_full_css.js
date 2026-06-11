import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(path, 'utf8');

const query = 'CSS rules injected by widgets.js:';
let idx = content.indexOf(query);
if (idx !== -1) {
  console.log("Found CSS rules injected by widgets.js at:", idx);
  console.log(content.substring(idx, idx + 4000));
} else {
  // Let's do a general search for game-score styles
  const query2 = 'game-item .game-score';
  let idx2 = content.indexOf(query2);
  if (idx2 !== -1) {
    console.log("Found game-score CSS at:", idx2);
    console.log(content.substring(idx2 - 200, idx2 + 1500));
  } else {
    console.log("Not found");
  }
}
