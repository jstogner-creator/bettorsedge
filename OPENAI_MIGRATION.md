# OpenAI-Only Migration Notes

_Last updated: June 9, 2026_

## Completed

- Replaced the client analysis service implementation with an OpenAI-only engine.
- All client-side AI calls now route through authenticated server endpoints instead of browser-side OpenAI/Gemini clients.
- Added deterministic edge-model logic before AI explanation:
  - model probability
  - market probability
  - edge percentage
  - data quality grade
  - no-play/lean/play recommendation
  - model and prompt version tags
- Updated QA service labels/checks from Gemini to OpenAI.
- Removed obsolete standalone Gemini scripts:
  - `run_analysis.ts`
  - `test_gemini_mlb.ts`
- Removed `GEMINI_API_KEY` from `.env.example`.

## Important compatibility note

The app still has a file named `src/services/gemini.ts` because multiple UI files import `bettorsEdge` from that path. The implementation inside that file is now OpenAI-only. The filename should be renamed to `openai.ts` after all imports are updated and verified by a local build.

## Backend cleanup still required

`server.ts` still contains a Gemini import and fallback branch in `/api/ai/analyze`. This should be removed with a careful local patch because `server.ts` is large and should not be blindly overwritten.

Required backend changes:

1. Remove:

```ts
import { GoogleGenAI } from "@google/genai";
```

2. In `/api/admin/qa-health`, remove the `gemini` object.

3. In `/api/ai/analyze`, reject all providers except OpenAI:

```ts
if (provider !== "openai") {
  return res.status(400).json({ error: "Only OpenAI provider is supported." });
}
```

4. Remove the Gemini fallback block:

```ts
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

5. After the backend no longer imports Gemini, remove this dependency from `package.json`:

```json
"@google/genai": "^1.29.0"
```

## Required environment

Production now requires:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Do not expose `OPENAI_API_KEY` with a `VITE_` prefix.

## Recommended verification commands

Run locally before deploying:

```bash
rm -rf node_modules package-lock.json
npm install
npm run lint
npm run build
npm audit
```

If `server.ts` is patched to remove Gemini, regenerate and commit the new `package-lock.json`.
