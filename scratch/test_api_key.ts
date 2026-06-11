import axios from "axios";

const key = "b2795a8c744b26f971aaf15eb994212e";

async function testKey() {
  const endpoints = [
    { name: "NBA", url: "https://v2.nba.api-sports.io/status" },
    { name: "Baseball", url: "https://v1.baseball.api-sports.io/status" },
    { name: "Basketball", url: "https://v1.basketball.api-sports.io/status" }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing key against ${endpoint.name} endpoint: ${endpoint.url}...`);
      const res = await axios.get(endpoint.url, {
        headers: {
          "x-apisports-key": key
        }
      });
      console.log(`Response status: ${res.status}`);
      console.log(`Response data:`, JSON.stringify(res.data, null, 2));
    } catch (err: any) {
      console.error(`Error for ${endpoint.name}:`, err.response?.data || err.message);
    }
  }
}

testKey();
