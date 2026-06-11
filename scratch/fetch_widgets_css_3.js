import fs from 'node:fs';

async function run() {
  try {
    const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
    const text = await res.text();
    const query = 'font-family:Poppins';
    const idx = text.indexOf(query);
    if (idx !== -1) {
      console.log("Found Poppins at index:", idx);
      console.log("Context:\n", text.substring(idx - 600, idx + 400));
    } else {
      console.log("Poppins not found");
    }
  } catch (err) {
    console.error(err);
  }
}

run();
