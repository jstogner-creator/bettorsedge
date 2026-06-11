import fs from "fs";

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2473\\content.md";

try {
  const content = fs.readFileSync(filePath, "utf8");
  
  // Find "config" occurrences and show context
  let idx = 0;
  let count = 0;
  while ((idx = content.indexOf('type="config"', idx)) !== -1 || (idx = content.indexOf('data-type="config"', idx)) !== -1 || (idx = content.indexOf('config', idx)) !== -1) {
    if (content.substring(idx - 30, idx + 50).includes("data-type") || content.substring(idx - 30, idx + 50).includes("config")) {
      console.log(`Match ${++count}:`, content.substring(idx - 60, idx + 80));
    }
    idx += 10;
    if (count > 20) break;
  }
} catch (err) {
  console.error("Error:", err);
}
