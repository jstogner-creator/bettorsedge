import fs from 'node:fs';
import readline from 'node:readline';

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.length > 10000 && line.includes('game-item')) {
      console.log(`Found long line of length ${line.length}:`);
      let idx = line.indexOf('game-item');
      let count = 0;
      while (idx !== -1) {
        count++;
        console.log(`\n--- Match ${count} at ${idx} ---`);
        console.log(line.substring(idx - 100, idx + 600));
        idx = line.indexOf('game-item', idx + 1);
        if (count >= 15) break;
      }
      break;
    }
  }
}

run();
