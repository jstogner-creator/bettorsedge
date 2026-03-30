import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `
    You are an NBA betting decision engine focused on finding positive expected value.
    Analyze the last 3 NBA games that happened or are happening today (March 11, 2026).
    Provide a detailed analysis for each of the 3 games following the instructions:
    Output: market snapshot, team edge, injury impact, situational factors, scenario analysis, projected winner, win probability, projected spread, projected total, best betting angle, confidence score, and final recommendation.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  console.log(response.text);
}

run().catch(console.error);
