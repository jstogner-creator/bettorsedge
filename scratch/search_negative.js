import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

for (const r of rules) {
  const ruleTrim = r.trim();
  // Find any negative numbers followed by px, rem, em, %
  if (ruleTrim.match(/-\d+(\.\d+)?(px|rem|em|%)/)) {
    console.log(ruleTrim + '}\n');
  }
}
