import fs from 'node:fs';

async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  let idx = 0;
  let matches = 0;
  while (true) {
    idx = text.indexOf('formatPeriodScores', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 850));
    idx += 18;
    if (matches >= 5) break;
  }
}

run();
