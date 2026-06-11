import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2777\\content.md';
const content = fs.readFileSync(path, 'utf8');

const query = 'class ne extends';
const index = content.indexOf(query);
if (index !== -1) {
  console.log("Found class ne extends at:", index);
  console.log(content.substring(index, index + 3500));
} else {
  // Let's search for "class ne" or "ne = class"
  const neIndex = content.indexOf('customElements.define("game-item"');
  if (neIndex !== -1) {
    console.log("Found define game-item at:", neIndex);
    console.log(content.substring(neIndex - 2000, neIndex + 500));
  }
}
