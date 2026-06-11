import fs from 'node:fs';

async function run() {
  try {
    const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
    const text = await res.text();
    console.log("First 2500 chars of widgets.js:\n");
    console.log(text.substring(0, 2500));
  } catch (err) {
    console.error(err);
  }
}

run();
