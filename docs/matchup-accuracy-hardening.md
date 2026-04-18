# Matchup Accuracy Hardening

## Objective
Improve BettorsEdge matchup analysis so predictions are driven by fresh, structured injury data and same-season matchup context rather than stale or hallucinated status information.

## What was added in this branch
- `src/services/predictionIntegrity.ts`
  - normalizes injury statuses
  - assigns source priority
  - rejects stale timestamps by TTL
  - merges structured/API injuries ahead of AI-generated injuries and old cached injuries
  - applies confidence penalties when availability is unresolved
  - flags predictions that require reanalysis near tipoff/lock
- `src/types.ts`
  - injury objects now support `source_priority` and `update`
  - `previousMatchups` now supports `significantChanges`, `injuryContext`, `venue`, `winner`, and `margin`
  - `dataQuality` now tracks injury freshness, stale counts, unresolved counts, availability penalty, analysis mode, and same-season matchup availability

## Required code integrations

### 1. Replace stale injury fallback behavior
Current anti-pattern in `src/services/gemini.ts`:
- if AI returns no injuries, old `existingPrediction.injuries` may be restored without freshness validation

Required fix:
- import `mergeInjuriesWithPrecedence`, `getFreshnessConfig`, and `applyAvailabilityConfidencePenalty`
- merge injuries in this order:
  1. structured API injuries
  2. verified current AI injuries
  3. existing cached injuries only if still fresh
- never restore stale cached injuries

### 2. Treat injuries as a first-class driver of prediction confidence
Required behavior:
- any `out`, `doubtful`, `questionable`, `game_time_decision`, or `minutes_limit` player with meaningful impact must affect confidence
- if a key player is unresolved, reduce confidence and widen implied uncertainty
- when stale injury rows exist, downgrade confidence and mark prediction as mixed/expected rather than confirmed

Suggested implementation in `processAIResponse()`:
- compute `freshness = getFreshnessConfig(game.league, game.date)`
- merge injuries via `mergeInjuriesWithPrecedence(...)`
- set `prediction.injuries = merged.injuries`
- set `prediction.dataQuality = { ... }`
- set `prediction.confidence = applyAvailabilityConfidencePenalty(prediction.confidence, merged)`

### 3. Force reanalysis closer to game time
Required behavior:
- predictions older than freshness threshold should rerun
- games within 120 minutes of start should rerun more aggressively
- any stale or unresolved injury entry should force reanalysis

Suggested implementation:
- replace `needsReanalysis()` logic with `shouldReanalyzePrediction()` from `predictionIntegrity.ts`

### 4. Same-season previous matchup card
User requirement:
- if the two teams played each other in the same year, show a previous matchup card with:
  - date
  - final score
  - winner
  - margin
  - venue
  - significant changes since that game
  - injury/lineup changes that could materially affect the current matchup

Required behavior:
- same-season matchups should be preferred over older history
- if no same-season matchup exists, explicitly indicate that instead of implying one
- the card should be available both in prediction JSON and UI rendering

Suggested data flow:
- query prior stored finished games for same teams in same league/year first
- if unavailable, fetch from structured schedule/results source
- compare the prior matchup injury context with current merged injuries
- populate:
  - `previousMatchups[n].significantChanges`
  - `previousMatchups[n].injuryContext`
  - `dataQuality.sameSeasonMatchupsFound`
  - `dataQuality.matchupHistoryCount`

### 5. Analysis mode labeling
Required output states:
- `confirmed`: no stale injuries and no unresolved key statuses
- `expected`: unresolved availability exists but fresh data is present
- `mixed`: stale data exists or multiple sources conflict

This should be set in `prediction.dataQuality.analysisMode` and displayed in the UI.

## Recommended prompt changes
Even after structured data is merged, the LLM prompt should explicitly state:
- injuries materially affect confidence and win probability
- same-season head-to-head results must be included when available
- significant changes since prior meetings must be listed succinctly
- AI may not invent old scores, injury statuses, or roster assignments

## Acceptance criteria
- stale injury rows never survive into saved predictions without a visible warning flag
- predictions with unresolved availability carry lower confidence
- same-season matchup card appears whenever available
- matchup card includes score and meaningful differences since prior meeting
- near-lock predictions rerun automatically when injury freshness expires
