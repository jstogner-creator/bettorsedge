import fs from 'node:fs';
import readline from 'node:readline';

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\f12e2410-fc2d-454e-8e87-988218b3ddb0\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line) continue;
    try {
      const step = JSON.parse(line);
      if (step.type === 'RUN_COMMAND' && step.content && step.content.includes('CSS rules injected by widgets.js:') && !step.content.includes('print_original_css')) {
        const output = step.content;
        // Let's find the css rule for game-item or game-score inside the output
        const searchStr = 'game-item';
        let idx = output.indexOf(searchStr);
        while (idx !== -1) {
          console.log(`\n=== Match at ${idx} ===`);
          console.log(output.substring(idx - 100, idx + 1000));
          idx = output.indexOf(searchStr, idx + 1);
          if (idx > 20000) break; // Avoid printing too much if it's huge
        }
        break;
      }
    } catch (e) {
      // ignore
    }
  }
}

run();
