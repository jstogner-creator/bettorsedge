import fs from 'node:fs';

async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  // Search for round-section in widgets.js
  let idx = 0;
  let matches = 0;
  while (true) {
    idx = text.indexOf('round-section', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== round-section Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 200, idx + 600));
    idx += 13;
    if (matches >= 8) break;
  }
}

run();
