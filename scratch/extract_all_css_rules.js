import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(path, 'utf8');

const query = "CSS rules injected by widgets.js:\n\n'@charset";
let idx = content.indexOf(query);
if (idx !== -1) {
  const start = idx + "CSS rules injected by widgets.js:\n\n".length;
  // Let's find the end of the string, which is probably a single quote or newline
  // We can just grab 25000 characters which will cover all the CSS rules
  const css = content.substring(start, start + 30000);
  fs.writeFileSync('scratch/widgets_original.css', css);
  console.log("Wrote scratch/widgets_original.css");
} else {
  // Try another variation
  const query2 = "CSS rules injected by widgets.js:\\n\\n'@charset";
  let idx2 = content.indexOf(query2);
  if (idx2 !== -1) {
    const start2 = idx2 + "CSS rules injected by widgets.js:\\n\\n".length;
    const css2 = content.substring(start2, start2 + 30000);
    fs.writeFileSync('scratch/widgets_original.css', css2);
    console.log("Wrote scratch/widgets_original.css from escaped string");
  } else {
    console.log("Could not find CSS start");
  }
}
