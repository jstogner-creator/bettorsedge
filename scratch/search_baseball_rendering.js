import fs from 'node:fs';

const js = fs.readFileSync('scratch/widgets_extracted.css', 'utf8'); // wait, the js is in widgets.js from CDN
// Let's download the full text of widgets.js and search it.
async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  // Search for "baseball" or "baseball-status" or similar in widgets.js
  let idx = 0;
  let matches = 0;
  while (true) {
    idx = text.indexOf('baseball', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 450));
    idx += 8;
    if (matches >= 10) break;
  }
}

run();
