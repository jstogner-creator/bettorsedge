import fs from "fs";
import path from "path";

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\steps\\2473\\content.md";

try {
  const content = fs.readFileSync(filePath, "utf8");
  console.log("File length:", content.length);
  
  // Search for window. something
  const matches = content.match(/window\.[a-zA-Z0-9_$]+/g);
  console.log("Window attachments:", [...new Set(matches)].slice(0, 10));

  // Search for ApiSportsWidgets
  console.log("Contains ApiSportsWidgets:", content.includes("ApiSportsWidgets"));
  
  // Search for refresh
  console.log("Contains refresh:", content.includes("refresh"));
  
  // Let's find occurrences of 'refresh' in context
  let idx = 0;
  while ((idx = content.indexOf("refresh", idx)) !== -1) {
    console.log(`Context around refresh at ${idx}:`, content.substring(idx - 50, idx + 50));
    idx += 7;
    if (idx > 10000) break; // limit output
  }
} catch (err) {
  console.error("Error:", err);
}
