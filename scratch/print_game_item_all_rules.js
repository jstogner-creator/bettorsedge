import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

console.log("=== ALL RULES CONTAINING game-item ===");
for (const r of rules) {
  const ruleTrim = r.trim();
  if (ruleTrim.includes('game-item')) {
    console.log(ruleTrim + '}\n');
  }
}
