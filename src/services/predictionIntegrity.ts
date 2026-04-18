export type CanonicalInjuryStatus = "out" | "doubtful" | "questionable" | "probable" | "available" | "minutes_limit" | "game_time_decision" | "unknown";

export interface InjuryRecord {
  team?: string;
  player?: string;
  status?: string;
  impact?: string;
  source_name?: string;
  source_timestamp?: string;
  update?: string;
  source_priority?: number;
}

export interface FreshnessConfig {
  injuryTtlMs: number;
  lineupTtlMs: number;
  marketTtlMs: number;
}

export interface InjuryMergeResult {
  injuries: InjuryRecord[];
  hasUnresolved: boolean;
  hasStale: boolean;
  staleCount: number;
  unresolvedCount: number;
  freshestTimestamp?: string;
}

const STATUS_MAP: Record<string, CanonicalInjuryStatus> = {
  out: "out",
  inactive: "out",
  ruledout: "out",
  doubtful: "doubtful",
  questionable: "questionable",
  probable: "probable",
  available: "available",
  active: "available",
  in: "available",
  healthy: "available",
  gtd: "game_time_decision",
  gametimedecision: "game_time_decision",
  minuteslimit: "minutes_limit",
  restricted: "minutes_limit"
};

export function getFreshnessConfig(league: string, gameTimeIso?: string): FreshnessConfig {
  const now = Date.now();
  const gameTime = gameTimeIso ? new Date(gameTimeIso).getTime() : now + 12 * 60 * 60 * 1000;
  const minutesToGame = Math.max(0, Math.round((gameTime - now) / 60000));

  if (minutesToGame <= 30) {
    return { injuryTtlMs: 10 * 60 * 1000, lineupTtlMs: 5 * 60 * 1000, marketTtlMs: 2 * 60 * 1000 };
  }
  if (minutesToGame <= 120) {
    return { injuryTtlMs: 20 * 60 * 1000, lineupTtlMs: 10 * 60 * 1000, marketTtlMs: 5 * 60 * 1000 };
  }
  if (league === "NBA") {
    return { injuryTtlMs: 30 * 60 * 1000, lineupTtlMs: 15 * 60 * 1000, marketTtlMs: 10 * 60 * 1000 };
  }
  return { injuryTtlMs: 60 * 60 * 1000, lineupTtlMs: 30 * 60 * 1000, marketTtlMs: 15 * 60 * 1000 };
}

export function normalizeInjuryStatus(status?: string): CanonicalInjuryStatus {
  if (!status) return "unknown";
  const key = status.toLowerCase().replace(/[^a-z]/g, "");
  return STATUS_MAP[key] || "unknown";
}

export function sourcePriority(sourceName?: string): number {
  const source = (sourceName || "").toLowerCase();
  if (!source) return 99;
  if (source.includes("official") || source.includes("nba") || source.includes("team report")) return 1;
  if (source.includes("rotowire") || source.includes("espn") || source.includes("api-sports") || source.includes("api sports")) return 2;
  if (source.includes("beat") || source.includes("underdog")) return 3;
  if (source.includes("ai")) return 8;
  return 5;
}

export function isStaleTimestamp(timestamp?: string, ttlMs: number = 30 * 60 * 1000): boolean {
  if (!timestamp) return true;
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) return true;
  return (Date.now() - parsed) > ttlMs;
}

function cleanTeamName(team?: string): string {
  return (team || "").trim().toLowerCase();
}

function cleanPlayerName(player?: string): string {
  return (player || "").trim().toLowerCase();
}

function isValidForGame(injury: InjuryRecord, homeTeam: string, awayTeam: string): boolean {
  const injuryTeam = cleanTeamName(injury.team);
  const home = cleanTeamName(homeTeam);
  const away = cleanTeamName(awayTeam);
  if (!injury.player || !injuryTeam) return false;
  return home.includes(injuryTeam) || injuryTeam.includes(home) || away.includes(injuryTeam) || injuryTeam.includes(away);
}

export function mergeInjuriesWithPrecedence(params: {
  homeTeam: string;
  awayTeam: string;
  structured?: InjuryRecord[];
  ai?: InjuryRecord[];
  existing?: InjuryRecord[];
  ttlMs?: number;
}): InjuryMergeResult {
  const ttlMs = params.ttlMs ?? 30 * 60 * 1000;
  const merged = new Map<string, InjuryRecord>();

  const ingest = (records: InjuryRecord[] | undefined, fallbackPriority: number) => {
    for (const raw of records || []) {
      const injury: InjuryRecord = {
        ...raw,
        source_priority: raw.source_priority ?? sourcePriority(raw.source_name) ?? fallbackPriority
      };
      if (!isValidForGame(injury, params.homeTeam, params.awayTeam)) continue;
      const key = `${cleanTeamName(injury.team)}::${cleanPlayerName(injury.player)}`;
      const existing = merged.get(key);
      const incomingTs = injury.source_timestamp ? new Date(injury.source_timestamp).getTime() : 0;
      const existingTs = existing?.source_timestamp ? new Date(existing.source_timestamp).getTime() : 0;
      const incomingPriority = injury.source_priority ?? fallbackPriority;
      const existingPriority = existing?.source_priority ?? 999;

      const shouldReplace = !existing || incomingPriority < existingPriority || (incomingPriority === existingPriority && incomingTs >= existingTs);
      if (shouldReplace) {
        merged.set(key, {
          ...injury,
          status: normalizeInjuryStatus(injury.status)
        });
      }
    }
  };

  ingest(params.existing, 6);
  ingest(params.ai, 4);
  ingest(params.structured, 1);

  const injuries = Array.from(merged.values());
  let hasUnresolved = false;
  let hasStale = false;
  let staleCount = 0;
  let unresolvedCount = 0;
  let freshestTs = 0;

  for (const injury of injuries) {
    const normalized = normalizeInjuryStatus(injury.status);
    if (["questionable", "game_time_decision", "minutes_limit", "unknown"].includes(normalized)) {
      hasUnresolved = true;
      unresolvedCount += 1;
    }
    const stale = isStaleTimestamp(injury.source_timestamp, ttlMs);
    if (stale) {
      hasStale = true;
      staleCount += 1;
    }
    const ts = injury.source_timestamp ? new Date(injury.source_timestamp).getTime() : 0;
    if (!Number.isNaN(ts) && ts > freshestTs) freshestTs = ts;
  }

  return {
    injuries,
    hasUnresolved,
    hasStale,
    staleCount,
    unresolvedCount,
    freshestTimestamp: freshestTs ? new Date(freshestTs).toISOString() : undefined
  };
}

export function applyAvailabilityConfidencePenalty(baseConfidence: number, merge: InjuryMergeResult): number {
  let penalty = 0;
  penalty += Math.min(merge.staleCount, 3);
  penalty += Math.min(merge.unresolvedCount, 2);
  const adjusted = Math.max(1, Math.min(10, Math.round(baseConfidence - penalty)));
  return adjusted;
}

export function shouldReanalyzePrediction(params: {
  gameTimeIso?: string;
  predictionLastUpdated?: string;
  confidence?: number;
  winner?: string;
  injuries?: InjuryRecord[];
  league?: string;
}): boolean {
  if (!params.predictionLastUpdated) return true;
  if (!params.winner || params.winner === "TBD") return true;

  const now = Date.now();
  const gameTime = params.gameTimeIso ? new Date(params.gameTimeIso).getTime() : now + 12 * 60 * 60 * 1000;
  if (now > gameTime) return false;

  const freshness = getFreshnessConfig(params.league || "NBA", params.gameTimeIso);
  const updatedAt = new Date(params.predictionLastUpdated).getTime();
  const ageMs = now - updatedAt;
  const minutesToGame = Math.max(0, Math.round((gameTime - now) / 60000));

  if (ageMs > 12 * 60 * 60 * 1000) return true;
  if ((params.confidence ?? 5) < 7 && ageMs > 4 * 60 * 60 * 1000) return true;
  if (minutesToGame <= 120 && ageMs > 45 * 60 * 1000) return true;
  if ((params.injuries || []).some(i => isStaleTimestamp(i.source_timestamp, freshness.injuryTtlMs))) return true;
  if ((params.injuries || []).some(i => ["questionable", "game_time_decision", "unknown"].includes(normalizeInjuryStatus(i.status)))) return true;

  return false;
}
