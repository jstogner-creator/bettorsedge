import fs from 'node:fs';

async function run() {
  try {
    const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
    const text = await res.text();
    
    // Find Poppins font definition which is near the start of the CSS
    const query = 'font-family:Poppins';
    const idx = text.indexOf(query);
    if (idx !== -1) {
      // Find the template string backtick before this
      const startIdx = text.lastIndexOf('`', idx);
      const endIdx = text.indexOf('`', idx);
      if (startIdx !== -1 && endIdx !== -1) {
        const css = text.substring(startIdx + 1, endIdx);
        fs.writeFileSync('scratch/widgets_actual.css', css);
        console.log("Extracted CSS of length:", css.length);
        
        // Split and search rules
        const rules = css.split('}');
        console.log("Total rules:", rules.length);
        for (const r of rules) {
          const ruleTrim = r.trim();
          if (ruleTrim.includes('game-item') || ruleTrim.includes('game-score') || ruleTrim.includes('team-info') || ruleTrim.includes('score-home')) {
            console.log(ruleTrim + '}');
          }
        }
      } else {
        console.log("Could not find backticks around CSS");
      }
    } else {
      console.log("Could not find Poppins in widgets.js");
    }
  } catch (err) {
    console.error(err);
  }
}

run();
