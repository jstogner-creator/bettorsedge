import fs from 'node:fs';

async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  // Search for gamesStyle or games-style (case-insensitive)
  let idx = 0;
  let matches = 0;
  while (true) {
    idx = text.toLowerCase().indexOf('gamesstyle', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Match ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 450));
    idx += 10;
    if (matches >= 10) break;
  }
  
  // Let's search for "games-style"
  idx = 0;
  matches = 0;
  while (true) {
    idx = text.toLowerCase().indexOf('games-style', idx);
    if (idx === -1) break;
    matches++;
    console.log(`\n=== Match games-style ${matches} at ${idx} ===`);
    console.log(text.substring(idx - 150, idx + 450));
    idx += 11;
    if (matches >= 10) break;
  }
}

run();
