import axios from "axios";

const key = "b2795a8c744b26f971aaf15eb994212e";

async function testNba() {
  try {
    console.log("Querying NBA games for season 2023...");
    const res = await axios.get("https://v2.nba.api-sports.io/games", {
      headers: { "x-apisports-key": key },
      params: { season: 2023 }
    });
    console.log("Results for 2023:", res.data.results);
    if (res.data.response && res.data.response.length > 0) {
      console.log("Raw first game object keys:", Object.keys(res.data.response[0]));
      console.log("First game object details:", JSON.stringify(res.data.response[0], null, 2));
    }
  } catch (err: any) {
    console.error("Error games:", err.response?.data || err.message);
  }
}

testNba();
