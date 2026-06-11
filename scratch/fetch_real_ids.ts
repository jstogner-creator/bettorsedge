import axios from "axios";

const key = "b2795a8c744b26f971aaf15eb994212e";

async function fetchRealIds() {
  const dates = ["2024-03-10", "2025-03-10", "2026-03-10"];
  
  for (const dateStr of dates) {
    try {
      console.log(`Fetching NBA games for date: ${dateStr}...`);
      const res = await axios.get("https://v2.nba.api-sports.io/games", {
        headers: { "x-apisports-key": key },
        params: { date: dateStr }
      });
      console.log(`Results for ${dateStr}:`, res.data.results);
      if (res.data.response && res.data.response.length > 0) {
        console.log("Found NBA Game IDs:");
        res.data.response.slice(0, 5).forEach((g: any) => {
          console.log(`- ID: ${g.id}, Matchup: ${g.teams.away.name} @ ${g.teams.home.name}`);
        });
        break; // found games
      }
    } catch (err: any) {
      console.error(`Error fetching NBA for ${dateStr}:`, err.response?.data || err.message);
    }
  }
}

fetchRealIds();
