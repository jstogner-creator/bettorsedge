import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

console.log("=== RULES CONTAINING .game-score OR .score ===");
for (const r of rules) {
  const ruleTrim = r.trim();
  if (ruleTrim.includes('.game-score') || ruleTrim.includes('.score-home') || ruleTrim.includes('.score-away')) {
    console.log(ruleTrim + '}\n');
  }
}
