import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

for (const r of rules) {
  const ruleTrim = r.trim();
  if (ruleTrim.includes('absolute') || ruleTrim.includes('margin-left') || ruleTrim.includes('translate') || ruleTrim.includes('left:') || ruleTrim.includes('right:')) {
    if (ruleTrim.includes('score') || ruleTrim.includes('team') || ruleTrim.includes('game-item')) {
      console.log(ruleTrim + '}');
    }
  }
}
