import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseConfigPath = path.join(__dirname, "../firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {});

async function run() {
  console.log("Querying Firestore predictions with Client SDK & Custom DB ID...");
  const q = query(collection(db, "predictions"), where("league", "==", "MLB"));
  const snapshot = await getDocs(q);
  console.log(`Found ${snapshot.size} MLB predictions.`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\nGame ID: ${doc.id}`);
    console.log(`Winner: ${data.winner}`);
    console.log(`Date: ${data.date}`);
    console.log("mlbContext:", JSON.stringify(data.mlbContext, null, 2));
  });
}

run().catch(console.error);
