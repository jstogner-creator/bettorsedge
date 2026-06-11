async function run() {
  const res = await fetch('https://widgets.api-sports.io/3.1.0/widgets.js');
  const text = await res.text();
  
  // Find all tab-related attribute handling  
  const patterns = ['"tab"', "'tab'", 'data-tab', 'showTab', 'activeTab', 'tab-statistics', 'tab-events'];
  for (const p of patterns) {
    let idx = text.indexOf(p);
    if (idx !== -1) {
      process.stdout.write(`\n--- "${p}" at ${idx} ---\n`);
      process.stdout.write(text.substring(Math.max(0, idx - 60), idx + 300) + '\n');
    }
  }
}
run();
