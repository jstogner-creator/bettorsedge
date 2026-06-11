import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

for (const r of rules) {
  const ruleTrim = r.trim();
  if (ruleTrim.includes('position:')) {
    console.log(ruleTrim + '}');
  }
}
