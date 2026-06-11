import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseConfigPath = path.join(__dirname, "../firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));

// Initialize firebase admin with project ID
initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = firebaseConfig.firestoreDatabaseId ? getFirestore(firebaseConfig.firestoreDatabaseId) : getFirestore();

async function run() {
  console.log("Querying Firestore predictions with Admin SDK & DB ID:", firebaseConfig.firestoreDatabaseId);
  const snapshot = await db.collection("predictions").where("league", "==", "MLB").get();
  console.log(`Found ${snapshot.size} MLB predictions.`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\nGame ID: ${doc.id}`);
    console.log(`Winner: ${data.winner}`);
    console.log(`Date: ${data.date}`);
    console.log("mlbContext normalizedTeamStats:", JSON.stringify(data.mlbContext?.normalizedTeamStats, null, 2));
    console.log("mlbContext teamStatistics:", JSON.stringify(data.mlbContext?.teamStatistics, null, 2));
  });
}

run().catch(console.error);
