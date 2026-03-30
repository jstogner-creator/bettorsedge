import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function testGeminiMLB() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const date = new Date().toISOString().split('T')[0];
  const league = "MLB";
  const searchLeague = "MLB Baseball";

  const prompt = `
      Find EVERY SINGLE ${searchLeague} game scheduled for ${date}. 
      CRITICAL: Do not miss any matchups. Check multiple sources (ESPN, Yahoo Sports, NBA.com, etc.) to ensure 100% coverage.
      If there are 10 games, return 10. If there are 15, return 15. Do not truncate the list.
      
      Return valid JSON array:
      [
      {
        "id": "unique_string_id",
        "league": "${league}",
        "homeTeam": "Full Name",
        "awayTeam": "Full Name",
        "date": "${date}",
        "time": "Time w/ Zone",
        "location": "Arena, City",
        "status": "scheduled",
        "homeTeamStats": {"last5": "W-L-W-L-W", "winPercentage": ".650", "record": "32-15"},
        "awayTeamStats": {"last5": "L-L-W-L-W", "winPercentage": ".420", "record": "20-27"}
      }
      ]
      CRITICAL: The "id" field MUST be a unique string for each game (e.g., "nba-lakers-celtics-2024-03-27").
      ONLY return games for ${date}. If a game is for a different date, EXCLUDE it.
      No markdown. No conversational text. Just the JSON.
    `;

  try {
    console.log(`Calling Gemini for ${league} on ${date}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    console.log("Response:");
    console.log(response.text);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

testGeminiMLB();
