import "dotenv/config";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseConfigPath = path.join(__dirname, "../firebase-applet-config.json");
if (fs.existsSync(firebaseConfigPath)) {
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  initializeApp({
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
} else {
  initializeApp();
}

const db = getFirestore();

async function run() {
  console.log("Querying Firestore predictions...");
  const snapshot = await db.collection("predictions").where("league", "==", "MLB").get();
  console.log(`Found ${snapshot.size} MLB predictions.`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\nGame ID: ${doc.id}`);
    console.log(`Winner: ${data.winner}`);
    console.log(`Date: ${data.date}`);
    console.log("mlbContext fields:", Object.keys(data.mlbContext || {}));
    if (data.mlbContext?.normalizedTeamStats) {
      console.log("normalizedTeamStats (home):", data.mlbContext.normalizedTeamStats.home);
    } else {
      console.log("normalizedTeamStats is MISSING!");
    }
  });
}

run().catch(console.error);
