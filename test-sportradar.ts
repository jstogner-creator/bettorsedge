import axios from "axios";
import "dotenv/config";

async function testSportradar() {
  const apiKey = process.env.SPORTRADAR_API_KEY;
  if (!apiKey) {
    console.error("ERROR: SPORTRADAR_API_KEY is not set in environment variables.");
    process.exit(1);
  }

  console.log("Testing Sportradar NBA Injuries API (Trial)...");
  const url = `https://api.sportradar.us/nba/trial/v8/en/league/injuries.json?api_key=${apiKey}`;
  
  try {
    const response = await axios.get(url, { timeout: 15000 });
    console.log("SUCCESS!");
    console.log("Status:", response.status);
    console.log("Teams found:", response.data.teams?.length || 0);
    console.log("Generated at:", response.data.generated);
  } catch (error: any) {
    console.error("FAILED!");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

testSportradar();
