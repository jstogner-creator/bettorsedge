import fs from 'node:fs';

async function run() {
  try {
    const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
    const text = await res.text();
    console.log("Fetched widgets.js, length:", text.length);
    
    // Find where the CSS string is defined.
    // In widgets.js, there is typically a block like document.createTextNode("...") or similar.
    // Let's search for Poppins font or Noto Color Emoji which are typical.
    const query = 'Noto Color Emoji';
    const idx = text.indexOf(query);
    if (idx !== -1) {
      console.log("Found CSS query at:", idx);
      // Let's locate the enclosing quotes of the CSS string.
      // Usually, it's document.createTextNode("CSS_HERE")
      let startIdx = text.lastIndexOf('"', idx);
      if (startIdx === -1) startIdx = text.lastIndexOf("'", idx);
      if (startIdx === -1) startIdx = text.lastIndexOf("`", idx);
      
      let endIdx = text.indexOf('"', idx);
      if (endIdx === -1) endIdx = text.indexOf("'", idx);
      if (endIdx === -1) endIdx = text.indexOf("`", idx);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const css = text.substring(startIdx + 1, endIdx);
        fs.writeFileSync('scratch/widgets_actual.css', css);
        console.log("Wrote scratch/widgets_actual.css. Length:", css.length);
        
        // Let's format and print some game-item or game-score styles
        const rules = css.split('}');
        console.log("Total rules:", rules.length);
        for (const r of rules) {
          if (r.includes('game-item') || r.includes('game-score') || r.includes('team-info') || r.includes('score-home')) {
            console.log(r.trim() + '}');
          }
        }
      } else {
        console.log("Could not find start/end quotes around CSS");
      }
    } else {
      console.log("Could not find Noto Color Emoji in widgets.js");
    }
  } catch (err) {
    console.error("Error fetching/extracting:", err);
  }
}

run();
