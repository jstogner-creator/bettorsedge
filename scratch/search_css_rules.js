import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_original.css', 'utf8');

// The CSS is minified, so let's split it by '}' and search for selectors
const rules = css.split('}');
console.log(`Total rules found: ${rules.length}`);

function search(selector) {
  console.log(`\n=== Rules matching "${selector}" ===`);
  let matches = 0;
  for (const rule of rules) {
    if (rule.includes(selector)) {
      matches++;
      console.log(`${rule.trim()}}`);
    }
  }
  console.log(`Total matches: ${matches}`);
}

search('game-item');
search('game-score');
search('team-info');
