import { Game } from "../types";

export function normalizeGame(g: any, fallbackLeague: string, fallbackDate: string): Game {
  // Normalize league
  let league = String(g.league || fallbackLeague || "").toUpperCase();
  if (league === "BASEBALL") league = "MLB";
  if (league === "BASKETBALL") league = "NBA";
  if (league === "HOCKEY") league = "NHL";
  if (league === "FOOTBALL") league = "NFL";

  const validLeagues = ["NBA", "NCAA", "NHL", "NFL", "MLB"];
  if (!validLeagues.includes(league)) {
    league = fallbackLeague.toUpperCase();
  }

  // Clean date
  const dateVal = g.date ? String(g.date) : "";
  const safeDateStr = dateVal ? dateVal.split("T")[0] : fallbackDate;

  // Clean teams
  const homeTeam = g.homeTeam || "Unknown Home Team";
  const awayTeam = g.awayTeam || "Unknown Away Team";

  // Ensure stable document ID
  let id = g.id;
  if (!id || id === "unique-id" || id === "unique_string_id" || String(id).startsWith("undefined-")) {
    id = `${league.toLowerCase()}-${awayTeam}-${homeTeam}-${safeDateStr}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");
  }

  // Normalize API-Sports IDs
  const apiSportsGameId = g.apiSportsGameId !== undefined && g.apiSportsGameId !== null ? Number(g.apiSportsGameId) : undefined;
  const apiSportsHomeTeamId = g.apiSportsHomeTeamId !== undefined && g.apiSportsHomeTeamId !== null ? Number(g.apiSportsHomeTeamId) : undefined;
  const apiSportsAwayTeamId = g.apiSportsAwayTeamId !== undefined && g.apiSportsAwayTeamId !== null ? Number(g.apiSportsAwayTeamId) : undefined;

  // Normalize status
  let statusStr: Game["status"] = "scheduled";
  if (g.status) {
    if (typeof g.status === "string") {
      const s = g.status.toLowerCase();
      if (s === "live" || s === "in_progress" || s === "in progress" || s === "active") {
        statusStr = "live";
      } else if (s === "finished" || s === "ft" || s === "complete" || s === "final") {
        statusStr = "finished";
      } else {
        statusStr = "scheduled";
      }
    } else if (typeof g.status === "object") {
      const short = String(g.status.short || "").toUpperCase();
      const long = String(g.status.long || "").toLowerCase();
      
      const finishedShorts = ["FT", "AOT", "POST", "AET", "AWD", "WO", "FT-OT", "FINISHED", "FINAL", "COMPLETE"];
      const liveShorts = [
        "1H", "2H", "1Q", "2Q", "3Q", "4Q", "OT", "LIVE", 
        "Q1", "Q2", "Q3", "Q4", "BT", 
        "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "EI"
      ];

      if (finishedShorts.includes(short) || long.includes("finished") || long.includes("complete") || long.includes("final")) {
        statusStr = "finished";
      } else if (liveShorts.includes(short) || long.includes("inning") || long.includes("progress") || long.includes("halftime") || long.includes("live")) {
        statusStr = "live";
      } else {
        statusStr = "scheduled";
      }
    }
  }

  return {
    ...g,
    id,
    league: league as Game["league"],
    date: safeDateStr,
    homeTeam,
    awayTeam,
    status: statusStr,
    time: g.time || "00:00",
    location: g.location || "Unknown Venue",
    apiSportsGameId,
    apiSportsHomeTeamId,
    apiSportsAwayTeamId,
  };
}
