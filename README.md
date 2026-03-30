<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bae7663b-061b-4956-9fe1-ac227422dc91

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env.local` (or AI Studio Secrets) to your Gemini API key.
   - The key is used **server-side only** (see `server.ts`), so it is not exposed to the browser.
3. Run the app:
   `npm run dev`
