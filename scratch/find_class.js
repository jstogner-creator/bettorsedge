import fs from 'node:fs';

const path = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2777\\content.md';
const content = fs.readFileSync(path, 'utf8');

const query = 'initConfig(){';
const index = content.indexOf(query);
if (index !== -1) {
  console.log("Found initConfig at:", index);
  console.log(content.substring(index, index + 2000));
} else {
  console.log("initConfig not found");
}
