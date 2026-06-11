import fs from 'node:fs';
import readline from 'node:readline';

async function search() {
  const fileStream = fs.createReadStream('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes('api-sports-widget') && (line.includes('style') || line.includes('game-item')) && line.includes('display:')) {
      console.log(`Line ${lineNum} matches:`);
      // Print first 500 chars of the line
      console.log(line.substring(0, 800) + '...');
    }
  }
}

search();
