import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2777\\content.md';
const content = fs.readFileSync(path, 'utf8');

// Find the style definition inside the document.createTextNode block
const startQuery = 'document.createTextNode(';
const startIndex = content.indexOf(startQuery);
if (startIndex !== -1) {
  const cssStart = startIndex + startQuery.length;
  // Let's print the first 6000 characters of the CSS rules
  console.log("CSS rules injected by widgets.js:\n");
  console.log(content.substring(cssStart, cssStart + 6000));
} else {
  console.log("createTextNode not found");
}
