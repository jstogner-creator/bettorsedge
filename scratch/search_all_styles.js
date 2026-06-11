import fs from 'node:fs';

const css = fs.readFileSync('scratch/widgets_extracted.css', 'utf8');
const rules = css.split('}');

const styles = new Set();
for (const r of rules) {
  const matches = r.match(/data-[a-z-]+-style="[^"]+"/g);
  if (matches) {
    for (const m of matches) {
      styles.add(m);
    }
  }
  
  // also check for any data-attribute that ends with style
  const matches2 = r.match(/data-[a-z-]*style/g);
  if (matches2) {
    for (const m of matches2) {
      styles.add(m);
    }
  }
}

console.log("Found style data-attributes in CSS:", Array.from(styles));
