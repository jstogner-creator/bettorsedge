
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

async function testSportradarMLB() {
  const apiKey = process.env.SPORTRADAR_API_KEY;
  if (!apiKey) {
    console.error("SPORTRADAR_API_KEY not set");
    return;
  }

  const year = "2026";
  const month = "03";
  const day = "30";
  const league = "mlb";
  const version = "v7";
  const paths = ["trial", "production", "official"];
  const domains = ["api.sportradar.us", "api.sportradar.com"];

  for (const domain of domains) {
    for (const pathType of paths) {
      const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`;
      console.log(`Trying: ${url}`);
      try {
        const response = await axios.get(url, { timeout: 10000 });
        console.log(`SUCCESS: ${domain}/${pathType}`);
        console.log(`Games count: ${response.data.games?.length || 0}`);
        if (response.data.games && response.data.games.length > 0) {
          console.log("First game:", response.data.games[0].home.name, "vs", response.data.games[0].away.name);
        }
        return;
      } catch (error: any) {
        console.log(`FAILED: ${domain}/${pathType} - ${error.message}`);
        if (error.response) {
          console.log(`Status: ${error.response.status}`);
        }
      }
    }
  }
}

testSportradarMLB();
