import fs from 'node:fs';

async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  // Search for h2h-style or h2hStyle in widgets.js
  let idx = 0;
  let matches = 0;
  while (true) {
    idx = text.toLowerCase().indexOf('h2h-style', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 450));
    idx += 9;
    if (matches >= 10) break;
  }
  
  // Let's also search for gameStyle or game-style
  idx = 0;
  matches = 0;
  while (true) {
    idx = text.toLowerCase().indexOf('game-style', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Game Style Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 450));
    idx += 10;
    if (matches >= 10) break;
  }
}

run();
