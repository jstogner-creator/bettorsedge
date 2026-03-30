import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const firebaseConfigPath = path.join(__dirname, "firebase-applet-config.json");
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
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "" });

async function getNBAGames() {
  // Use US Eastern Time for the date string to align with NBA slates
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = etFormatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const dateStr = `${year}${month}${day}`;
  
  console.log(`Fetching NBA games for slate: ${dateStr} (ET)`);
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}&limit=100`;
  const response = await axios.get(url);
  const data = response.data;
  
  if (!data.events) return [];

  // Filter games to ensure they belong to the requested date in ET
  return data.events.map((event: any) => {
    const competition = event.competitions[0];
    const competitors = competition.competitors;
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");

    // Check if the game date in ET matches our dateStr
    const gameDate = new Date(event.date);
    const gameEtParts = etFormatter.formatToParts(gameDate);
    const gYear = gameEtParts.find(p => p.type === 'year')?.value;
    const gMonth = gameEtParts.find(p => p.type === 'month')?.value;
    const gDay = gameEtParts.find(p => p.type === 'day')?.value;
    const gDateStr = `${gYear}${gMonth}${gDay}`;

    console.log(`[DEBUG] Checking game: ${event.name} - Date: ${event.date}, ET: ${gDateStr}, Target: ${dateStr}`);

    if (gDateStr !== dateStr) {
      console.log(`Skipping game ${event.name} (${event.date}) - belongs to slate ${gDateStr}, not ${dateStr}`);
      return null;
    }

    return {
      id: event.id,
      league: "NBA",
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      date: event.date,
      time: new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + " ET",
      location: competition.venue?.fullName || "Unknown Venue",
      status: "scheduled",
    };
  }).filter(Boolean);
}

async function analyzeGame(game: any) {
  const systemInstruction = `You are a professional NBA betting decision engine focused on finding positive expected value, not forcing action. Analyze each game using team strength, matchup interaction, injuries, rest, schedule, location, market odds, and scenario analysis. Consider offensive/defensive ratings, pace, recent form, home/away splits, lineup changes, on/off impact, travel fatigue, back-to-backs, and line movement. Compare your estimated win probability and projected spread/total to sportsbook implied probability. Only recommend a bet when a real edge exists. If evidence is mixed or injuries are unstable, recommend PASS. Never hallucinate injuries, odds, or stats. Always state uncertainty clearly.
  
NON-NEGOTIABLE RULES: 
1. DO NOT hallucinate players, injuries, or rosters. 
2. You MUST verify every player's current team assignment before including them in an injury report. 
3. If a player was recently traded, ensure they are listed on their NEW team. 
4. If you are unsure about a player's status or team, DO NOT include them. 
5. CRITICAL: For high-profile players, you MUST perform a targeted search to confirm their status for today's game. If they were previously injured, check if they have been upgraded to "Active", "Available", or "Playing". Do not assume they are out based on stale reports.
6. BE BLUNT: If a matchup is a toss-up, PASS. Do not force a prediction.
7. Always return valid JSON.`;

  const prompt = `
    Analyze NBA: ${game.awayTeam} @ ${game.homeTeam} (${game.date}). 
    
    Instructions:
    1. Keep analysis extremely brief and direct to save tokens.
    2. Injuries: Verify status (Active/Out/GTD). Only include confirmed roster players.
    3. H2H: Search for recent matchups between these two teams this season and return their final scores.
    4. Edge: Analyze pace, ratings, and motivation briefly.
    5. Value: True win probability vs implied odds.
    
    Decision: Only recommend BET if edge is clear. PASS if uncertain.
    
    Return JSON:
    {
      "gameId": "${game.id}",
      "winner": "Team Name",
      "confidence": 8,
      "winProbability": 0.65,
      "scorePrediction": {"home": 105, "away": 98},
      "reasoning": "Short, direct summary of edge and prediction.",
      "keyFactors": ["Short factor 1", "Short factor 2"],
      "injuries": [{"team": "Team", "player": "Name", "status": "Status"}],
      "previousMatchups": [{"date": "YYYY-MM-DD", "homeTeam": "Name", "awayTeam": "Name", "homeScore": 100, "awayScore": 90}]
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\n${prompt}` }] }],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  let text = response.text || "";
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) text = jsonMatch[1];
  
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj !== -1) {
    text = text.substring(startObj, endObj + 1);
  }

  const prediction = JSON.parse(text);
  prediction.teams = [game.awayTeam, game.homeTeam];
  prediction.lastUpdated = new Date().toISOString();
  prediction.outcome = null;
  prediction.qaStatus = "verified";
  
  return prediction;
}

async function run() {
  console.log("Fetching today's NBA games...");
  const games = await getNBAGames();
  console.log(`Found ${games.length} games.`);
  
  for (const game of games) {
    console.log(`Analyzing ${game.awayTeam} @ ${game.homeTeam}...`);
    try {
      const prediction = await analyzeGame(game);
      await db.collection("predictions").doc(String(game.id)).set(prediction, { merge: true });
      console.log(`Saved prediction for ${game.id}`);
    } catch (e: any) {
      console.error(`Failed to analyze ${game.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 5000)); // Rate limit protection
  }
  console.log("Done.");
}

run().catch(console.error);
