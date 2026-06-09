from pathlib import Path

path = Path("src/pages/Dashboard.tsx")
s = path.read_text()
changed = False

# Add cached schedule/static import helper inside fetchGames after date strings are known.
needle = '''    const dateStr = format(selectedDate, "yyyy-MM-dd");
  console.log(`[Dashboard] fetchGames: Fetching schedule for ${activeTab} on ${dateStr} (force=${force})`);

  try {
    let fetchedGames: Game[] = [];
    const dateStrIso = format(selectedDate, "yyyy-MM-dd");

    console.log(`[Dashboard] fetchGames: Parallel fetch starting for ${activeTab}...`);'''

replacement = '''    const dateStr = format(selectedDate, "yyyy-MM-dd");
  console.log(`[Dashboard] fetchGames: Fetching schedule for ${activeTab} on ${dateStr} (force=${force})`);

  try {
    let fetchedGames: Game[] = [];
    const dateStrIso = format(selectedDate, "yyyy-MM-dd");

    const normalizeImportedGame = (raw: any): Game | null => {
      if (!raw) return null;
      const rawLeague = raw.league?.name || raw.league || activeTab;
      const league = String(rawLeague).toUpperCase().includes("MLB") ? "MLB" : activeTab;

      if (raw.homeTeam && raw.awayTeam) {
        return {
          ...raw,
          id: String(raw.id || `${league}-${raw.awayTeam}-${raw.homeTeam}-${raw.date || dateStrIso}`).toLowerCase().replace(/[^a-z0-9]/g, "-"),
          league: league as Game["league"],
          homeTeam: String(raw.homeTeam),
          awayTeam: String(raw.awayTeam),
          date: String(raw.date || dateStrIso).split("T")[0],
          time: String(raw.time || (raw.date ? String(raw.date).split("T")[1]?.substring(0, 5) : "00:00")),
          location: raw.location || raw.venue?.name || raw.venue || "Unknown",
          status: raw.status || "scheduled",
        } as Game;
      }

      if (!raw.teams?.home?.name || !raw.teams?.away?.name) return null;
      const statusStr = raw.status?.short || raw.status?.long || "NS";
      let status: Game["status"] = "scheduled";
      if (["IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "IN7", "IN8", "IN9", "IN10", "IN11", "IN12", "IN", "LIVE"].includes(statusStr)) status = "live";
      if (["FT", "AOT", "FINAL"].includes(statusStr)) status = "finished";
      const dateVal = raw.date ? String(raw.date) : dateStrIso;
      const safeDateStr = dateVal.split("T")[0] || dateStrIso;
      const timeStr = raw.time || (dateVal.includes("T") ? dateVal.split("T")[1]?.substring(0, 5) : "00:00");

      return {
        id: `${league}-${raw.teams.away.name}-${raw.teams.home.name}-${safeDateStr}`.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        league: league as Game["league"],
        homeTeam: String(raw.teams.home.name),
        awayTeam: String(raw.teams.away.name),
        homeLogo: raw.teams.home.logo,
        awayLogo: raw.teams.away.logo,
        date: safeDateStr,
        time: timeStr || "00:00",
        location: raw.venue?.name || raw.venue || "Unknown",
        status,
        homeScore: raw.scores?.home?.total,
        awayScore: raw.scores?.away?.total,
        apiSportsGameId: raw.id,
        apiSportsHomeTeamId: raw.teams.home.id,
        apiSportsAwayTeamId: raw.teams.away.id,
      };
    };

    const scheduleDocId = `${activeTab}-${dateStrIso}`;
    if (!force && activeTab !== "Accuracy") {
      try {
        const cachedSchedule = await getDoc(doc(getDb(), "schedules", scheduleDocId));
        const cachedGames = cachedSchedule.exists() ? (cachedSchedule.data()?.games || []) : [];
        const normalizedCachedGames = Array.isArray(cachedGames)
          ? cachedGames.map(normalizeImportedGame).filter(Boolean) as Game[]
          : [];
        if (normalizedCachedGames.length > 0) {
          console.log(`[Dashboard] fetchGames: Using static cached schedule ${scheduleDocId} with ${normalizedCachedGames.length} games.`);
          setGames(normalizedCachedGames);
          fetchKalshiExpectations(activeTab).catch(console.error);
          return;
        }
      } catch (cacheErr) {
        console.warn(`[Dashboard] fetchGames: Static schedule cache read failed for ${scheduleDocId}`, cacheErr);
      }
    }

    console.log(`[Dashboard] fetchGames: Parallel fetch starting for ${activeTab}...`);'''

if needle in s and "const normalizeImportedGame = (raw: any): Game | null" not in s:
    s = s.replace(needle, replacement, 1)
    changed = True
    print("added static cache and MLB game normalizer")
elif "const normalizeImportedGame = (raw: any): Game | null" in s:
    print("static cache and normalizer already present")
else:
    raise SystemExit("fetchGames insertion point not found")

# Make API-Sports fallback branch accept already-normalized games or raw API-Sports games.
old_api_branch = '''          fetchedGames = apiSportsGames
            .filter(ag => ag?.teams?.home?.name && ag?.teams?.away?.name)
            .map(ag => {
            const statusStr = ag.status?.short || 'NS';'''

new_api_branch = '''          fetchedGames = apiSportsGames
            .map(normalizeImportedGame)
            .filter(Boolean) as Game[];
          /* legacy raw API-Sports mapper intentionally bypassed after normalizeImportedGame */
          if (false) apiSportsGames
            .filter(ag => ag?.teams?.home?.name && ag?.teams?.away?.name)
            .map(ag => {
            const statusStr = ag.status?.short || 'NS';'''

if old_api_branch in s:
    s = s.replace(old_api_branch, new_api_branch, 1)
    changed = True
    print("updated API-Sports fallback to use normalizer")
elif "legacy raw API-Sports mapper intentionally bypassed" in s:
    print("API-Sports fallback already patched")
else:
    print("warning: API-Sports fallback branch not found")

# Normalize AI/Firestore schedule games before league filtering.
old_ai_filter = '''    if (aiGames && Array.isArray(aiGames) && aiGames.length > 0) {
      const filteredAiGames = aiGames.filter((g) => {
        if (!g.league) return true;

        const gLeague = g.league.toUpperCase();'''

new_ai_filter = '''    if (aiGames && Array.isArray(aiGames) && aiGames.length > 0) {
      const normalizedAiGames = aiGames.map(normalizeImportedGame).filter(Boolean) as Game[];
      const filteredAiGames = normalizedAiGames.filter((g) => {
        if (!g.league) return true;

        const gLeague = String(g.league).toUpperCase();'''

if old_ai_filter in s:
    s = s.replace(old_ai_filter, new_ai_filter, 1)
    changed = True
    print("normalized AI/Firestore games before league filter")
elif "const normalizedAiGames = aiGames.map(normalizeImportedGame)" in s:
    print("AI/Firestore normalization already present")
else:
    print("warning: AI/Firestore league filter block not found")

# Save cleaned static schedule after final games are known.
old_set_games = '''      setGames(fetchedGames);
      fetchKalshiExpectations(activeTab).catch(console.error);'''

new_set_games = '''      try {
        await setDoc(doc(getDb(), "schedules", `${activeTab}-${dateStrIso}`), {
          league: activeTab,
          date: dateStrIso,
          games: fetchedGames,
          lastUpdated: new Date().toISOString(),
          source: "static-import-cache",
        }, { merge: true });
      } catch (cacheWriteErr) {
        console.warn(`[Dashboard] fetchGames: Static schedule cache write failed for ${activeTab}-${dateStrIso}`, cacheWriteErr);
      }
      setGames(fetchedGames);
      fetchKalshiExpectations(activeTab).catch(console.error);'''

if old_set_games in s and "static-import-cache" not in s:
    s = s.replace(old_set_games, new_set_games, 1)
    changed = True
    print("added static schedule cache write")
elif "static-import-cache" in s:
    print("static schedule cache write already present")
else:
    print("warning: setGames cache write insertion point not found")

# Make manual import import only selected day and use cache after import.
s = s.replace("setToast({ message: `Importing ${activeTab} schedule for next 7 days...`, type: \"info\" });", "setToast({ message: `Importing ${activeTab} schedule for ${format(selectedDate, \"yyyy-MM-dd\")}...`, type: \"info\" });")
s = s.replace("await bettorsEdge.importSchedule(activeTab, getNYDate(), 7, (msg) => {", "await bettorsEdge.importSchedule(activeTab, selectedDate, 1, (msg) => {")
s = s.replace("}, true);", "}, false);")
s = s.replace("fetchGames(true).catch(err => {", "fetchGames(false).catch(err => {")

path.write_text(s)
print("MLB static import patch complete", {"changed": changed})
