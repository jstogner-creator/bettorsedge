import axios from "axios";

async function testProxy() {
  const sport = "baseball";
  const league = "mlb";
  const dateStr = "20260330";
  const url = `http://localhost:3000/api/espn/schedule?sport=${sport}&league=${league}&dateStr=${dateStr}`;

  console.log(`Testing proxy: ${url}`);
  try {
    const response = await axios.get(url);
    console.log("SUCCESS");
    console.log("Event count:", response.data.events?.length);
  } catch (error: any) {
    console.error("FAILED");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
}

testProxy();
