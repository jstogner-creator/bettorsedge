from pathlib import Path

# 1) Filter API-Sports baseball to real MLB only.
mlb_path = Path('src/services/apiSportsMlb.ts')
s = mlb_path.read_text()
changed = False

old = '''  private normalizeApiSportsGame(raw: any, dateStr: string): Game | null {
    if (!raw?.teams?.home?.name || !raw?.teams?.away?.name) return null;

    const statusStr = raw.status?.short || raw.status?.long || "NS";'''
new = '''  private normalizeApiSportsGame(raw: any, dateStr: string): Game | null {
    const leagueName = String(raw?.league?.name || raw?.league || "").toLowerCase();
    const countryName = String(raw?.country?.name || raw?.country || "").toLowerCase();
    const isMajorLeagueBaseball =
      leagueName === "mlb" ||
      leagueName.includes("major league baseball") ||
      (leagueName.includes("mlb") and not leagueName.includes("minor"));

    if (!isMajorLeagueBaseball) {
      return null;
    }

    if (!raw?.teams?.home?.name || !raw?.teams?.away?.name) return null;

    const statusStr = raw.status?.short || raw.status?.long || "NS";'''
# fix accidental Python syntax in TypeScript replacement before writing
new = new.replace('(leagueName.includes("mlb") and not leagueName.includes("minor"));', 'leagueName.includes("mlb") && !leagueName.includes("minor");')

if old in s:
    s = s.replace(old, new, 1)
    changed = True
    print('added real MLB league filter')
elif 'isMajorLeagueBaseball' in s:
    print('real MLB league filter already present')
else:
    raise SystemExit('normalizeApiSportsGame insertion point not found')

# Clear bad local cache when no games are returned so stale Cuba games do not stick forever.
old_cache = '''      if (localCached && localCached.length > 0) {
        this.gamesCache.set(dateStr, { data: localCached, timestamp: Date.now() });
        console.log(`[API-Sports MLB] Using static local cache for ${dateStr}: ${localCached.length} games`);
        return localCached;
      }'''
new_cache = '''      if (localCached && localCached.length > 0) {
        const mlbOnlyCached = localCached.filter((g) => g.league === "MLB" && g.homeTeam && g.awayTeam);
        if (mlbOnlyCached.length > 0) {
          this.gamesCache.set(dateStr, { data: mlbOnlyCached, timestamp: Date.now() });
          console.log(`[API-Sports MLB] Using static local cache for ${dateStr}: ${mlbOnlyCached.length} games`);
          return mlbOnlyCached;
        }
      }'''
if old_cache in s:
    s = s.replace(old_cache, new_cache, 1)
    changed = True
    print('hardened local cache filtering')

mlb_path.write_text(s)
print('apiSportsMlb patch complete', {'changed': changed})

# 2) Deepen analysis output prompt/schema.
gemini_path = Path('src/services/gemini.ts')
g = gemini_path.read_text()
changed_g = False

old_shape = '''  "scorePrediction": { "home": 0, "away": 0 },
  "projectedTotal": 0,
  "recommendedTotalLine": "over/under/pass with reason",
  "injuries": [],
  "matchupAnalysis": {
    "h2h": "...",
    "playerStats": "...",
    "trends": "...",
    "confidenceBreakdown": "..."
  },'''
new_shape = '''  "scorePrediction": { "home": 0, "away": 0 },
  "projectedTotal": 0,
  "recommendedTotalLine": "Over/Under/PASS lean with target number and reason",
  "moneylineLean": "home/away/pass with reason",
  "spreadLean": "run-line/spread lean or pass with reason",
  "pitcherStrikeouts": {
    "homeStarter": { "name": "unknown", "projectedKs": 0, "lean": "over/under/pass", "reason": "..." },
    "awayStarter": { "name": "unknown", "projectedKs": 0, "lean": "over/under/pass", "reason": "..." }
  },
  "weatherAndPark": "weather, park factor, wind/run environment, or state if unavailable",
  "injuries": [],
  "matchupAnalysis": {
    "h2h": "head-to-head and matchup history",
    "playerStats": "pitching/batting matchup notes",
    "trends": "recent form, totals, market movement",
    "confidenceBreakdown": "why confidence is what it is"
  },'''
if old_shape in g:
    g = g.replace(old_shape, new_shape, 1)
    changed_g = True
    print('expanded analysis JSON schema')
else:
    print('warning: analysis JSON shape block not found or already changed')

old_reason = '''reasoning: aiPayload.reasoning || `${edgeModel.recommendation}: model probability ${Math.round(edgeModel.modelProbability * 100)}%${edgeModel.edge !== undefined ? ` vs market ${Math.round((edgeModel.marketProbability || 0) * 100)}%` : " with no reliable market probability"}.`,'''
new_reason = '''reasoning: aiPayload.reasoning || `${edgeModel.recommendation}: model probability ${Math.round(edgeModel.modelProbability * 100)}%${edgeModel.edge !== undefined ? ` vs market ${Math.round((edgeModel.marketProbability || 0) * 100)}%` : " with no reliable market probability"}. Projected score, total, pitcher strikeouts, weather/park factor, and matchup history should be treated as unavailable unless returned by the analysis payload.`,'''
if old_reason in g:
    g = g.replace(old_reason, new_reason, 1)
    changed_g = True
    print('expanded fallback reasoning')

# Store extra props in prediction payload without requiring strict TS type expansion.
old_extra = '''      recommendedTotalLine: aiPayload.recommendedTotalLine || "PASS unless total edge is independently confirmed.",
      matchupAnalysis: aiPayload.matchupAnalysis,'''
new_extra = '''      recommendedTotalLine: aiPayload.recommendedTotalLine || "PASS unless total edge is independently confirmed.",
      moneylineLean: (aiPayload as any).moneylineLean,
      spreadLean: (aiPayload as any).spreadLean,
      pitcherStrikeouts: (aiPayload as any).pitcherStrikeouts,
      weatherAndPark: (aiPayload as any).weatherAndPark,
      matchupAnalysis: aiPayload.matchupAnalysis,'''
if old_extra in g:
    g = g.replace(old_extra, new_extra, 1)
    changed_g = True
    print('stored betting props in prediction')
elif 'pitcherStrikeouts:' in g:
    print('betting props already stored')
else:
    print('warning: prediction extra prop insertion point not found')

gemini_path.write_text(g)
print('gemini deep output patch complete', {'changed': changed_g})
