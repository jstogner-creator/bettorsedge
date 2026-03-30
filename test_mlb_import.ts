import axios from "axios";

async function testMLB() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}&limit=500`;
  console.log(`Fetching MLB from: ${url}`);
  
  try {
    const response = await axios.get(url);
    console.log(`Status: ${response.status}`);
    console.log(`Events count: ${response.data.events?.length || 0}`);
    if (response.data.events) {
        response.data.events.forEach((e: any) => {
            console.log(`- ${e.name} (${e.date})`);
        });
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}

testMLB();
