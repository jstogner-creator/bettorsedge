import axios from "axios";

const key = "b2795a8c744b26f971aaf15eb994212e";

async function testGameIds() {
  const cases = [
    { name: "MLB Game 1280387", url: "https://v1.baseball.api-sports.io/games", params: { id: 1280387 } },
    { name: "NBA Game 286705", url: "https://v2.nba.api-sports.io/games", params: { id: 286705 } }
  ];

  for (const c of cases) {
    try {
      console.log(`Querying ${c.name} at ${c.url}...`);
      const res = await axios.get(c.url, {
        headers: { "x-apisports-key": key },
        params: c.params
      });
      console.log(`Status: ${res.status}`);
      console.log(`Response data count:`, res.data.results);
      if (res.data.response && res.data.response.length > 0) {
        console.log(`Sample game data:`, JSON.stringify(res.data.response[0], null, 2));
      } else {
        console.log(`Empty response:`, JSON.stringify(res.data, null, 2));
      }
    } catch (err: any) {
      console.error(`Error for ${c.name}:`, err.response?.data || err.message);
    }
  }
}

testGameIds();
