import fs from 'node:fs';

async function run() {
  try {
    const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
    const text = await res.text();
    
    const startStr = "document.createTextNode('";
    const startIdx = text.indexOf(startStr);
    if (startIdx !== -1) {
      const cssStart = startIdx + startStr.length;
      
      // Let's find the closing single quote. We need to be careful with escaped quotes (e.g., \').
      let endIdx = cssStart;
      while (endIdx < text.length) {
        if (text[endIdx] === "'" && text[endIdx - 1] !== '\\') {
          break;
        }
        endIdx++;
      }
      
      if (endIdx < text.length) {
        const css = text.substring(cssStart, endIdx);
        // Replace escaped quotes if any
        const unescapedCss = css.replace(/\\'/g, "'").replace(/\\"/g, '"');
        fs.writeFileSync('scratch/widgets_extracted.css', unescapedCss);
        console.log("Successfully extracted CSS to scratch/widgets_extracted.css");
        console.log("Total CSS length:", unescapedCss.length);
        
        // Find matching rules for game-item or game-score
        const rules = unescapedCss.split('}');
        console.log("Total CSS rules:", rules.length);
        
        const matchingRules = [];
        for (const r of rules) {
          const ruleTrim = r.trim();
          if (ruleTrim.includes('game-item') || ruleTrim.includes('game-score') || ruleTrim.includes('team-info') || ruleTrim.includes('score-home') || ruleTrim.includes('.score')) {
            matchingRules.push(ruleTrim + '}');
          }
        }
        
        console.log(`\n=== Found ${matchingRules.length} matching rules: ===`);
        console.log(matchingRules.join('\n\n'));
      } else {
        console.log("Could not find closing quote");
      }
    } else {
      console.log("Could not find start of createTextNode");
    }
  } catch (err) {
    console.error(err);
  }
}

run();
