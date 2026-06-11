async function run() {
  try {
    const res = await fetch('http://localhost:3000/');
    const html = await res.text();
    console.log("HTML length:", html.length);
    console.log("Contains '%VITE_API_SPORTS_WIDGET_KEY%':", html.includes('%VITE_API_SPORTS_WIDGET_KEY%'));
    const matches = html.match(/data-key="([^"]+)"/g);
    console.log("Matches for data-key:", matches);
    console.log("First 1500 chars of HTML:\n", html.substring(0, 1500));
  } catch (e) {
    console.error("Error fetching:", e);
  }
}
run();
