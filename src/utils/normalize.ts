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
  if (!id || id === "unique-id" || id === "unique_string_id" || id.startsWith("undefined-")) {
    id = `${league.toLowerCase()}-${awayTeam}-${homeTeam}-${safeDateStr}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");
  }

  // Normalize API-Sports IDs
  const apiSportsGameId = g.apiSportsGameId !== undefined && g.apiSportsGameId !== null ? Number(g.apiSportsGameId) : undefined;
  const apiSportsHomeTeamId = g.apiSportsHomeTeamId !== undefined && g.apiSportsHomeTeamId !== null ? Number(g.apiSportsHomeTeamId) : undefined;
  const apiSportsAwayTeamId = g.apiSportsAwayTeamId !== undefined && g.apiSportsAwayTeamId !== null ? Number(g.apiSportsAwayTeamId) : undefined;

  return {
    ...g,
    id,
    league: league as Game["league"],
    date: safeDateStr,
    homeTeam,
    awayTeam,
    status: g.status || "scheduled",
    time: g.time || "00:00",
    location: g.location || "Unknown Venue",
    apiSportsGameId,
    apiSportsHomeTeamId,
    apiSportsAwayTeamId,
  };
}
