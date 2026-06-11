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
        console.log(`Found step ${step.step_index}:`);
        console.log(step.content);
        break;
      }
    } catch (e) {
      // ignore JSON parse errors
    }
  }
}

run();
