import axios from "axios";

async function run() {
  try {
    const res = await axios.get("http://localhost:3000/api/debug-key");
    console.log(res.data);
  } catch (e: any) {
    console.error(e.response?.data || e.message);
  }
}
run();
