export type ResolvedAvailability = 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'AVAILABLE' | 'UNKNOWN' | 'CONFLICTING_REPORTS';

export interface NormalizedInjuryRecord {
  league: string;
  teamId: string;
  teamName?: string;
  playerId: string;
  playerName?: string;
  source: 'league_injuries' | 'daily_injuries' | 'daily_changelog' | 'summary' | 'derived';
  reportDate?: string;
  rawStatus?: string;
  status: ResolvedAvailability;
  description?: string;
  injuryType?: string;
  bodyPart?: string;
  lastSourceUpdateAt?: string;
}

export interface ResolvedInjuryRecord {
  league: string;
  teamId: string;
  teamName?: string;
  playerId: string;
  playerName?: string;
  resolvedStatus: ResolvedAvailability;
  confidence: number;
  sourcePriorityUsed: string[];
  conflict: boolean;
  stale: boolean;
  resolutionReason: string;
  rawStatuses: string[];
  reportDate?: string;
  lastChangedAt?: string;
  lastCheckedAt: string;
}

const STATUS_MAP: Array<{ test: RegExp; value: ResolvedAvailability }> = [
  { test: /\bout\b|inactive|ruled out|will not play/i, value: 'OUT' },
  { test: /doubtful/i, value: 'DOUBTFUL' },
  { test: /questionable|game-time decision|gtd/i, value: 'QUESTIONABLE' },
  { test: /probable|expected to play/i, value: 'PROBABLE' },
  { test: /available|active|healthy|cleared/i, value: 'AVAILABLE' },
];

function mapStatus(raw?: string): ResolvedAvailability {
  if (!raw) return 'UNKNOWN';
  const hit = STATUS_MAP.find(({ test }) => test.test(raw));
  return hit?.value ?? 'UNKNOWN';
}

function parseIsoDate(value?: string): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function normalizeStatusPriority(status: ResolvedAvailability): number {
  switch (status) {
    case 'OUT': return 6;
    case 'DOUBTFUL': return 5;
    case 'QUESTIONABLE': return 4;
    case 'PROBABLE': return 3;
    case 'AVAILABLE': return 2;
    case 'UNKNOWN': return 1;
    default: return 0;
  }
}

export function extractNormalizedInjuries(payload: any, source: NormalizedInjuryRecord['source'], league = 'nba', reportDate?: string): NormalizedInjuryRecord[] {
  const teams = payload?.teams || payload?.league?.teams || [];
  const out: NormalizedInjuryRecord[] = [];

  for (const team of teams) {
    const teamId = team.id || team.team?.id || '';
    const teamName = [team.market, team.name].filter(Boolean).join(' ') || team.alias || team.team?.name;
    const players = team.players || team.injuries || team.roster || [];

    for (const player of players) {
      const injury = player.injury || player.current_injury || player;
      const rawStatus = injury.status || injury.game_status || injury.designation || player.status || player.game_status;
      const bodyPart = injury.body_part || injury.location || injury.area;
      const injuryType = injury.type || injury.injury_type || injury.comment;
      const description = injury.desc || injury.description || injury.note || injury.details;
      const playerId = player.id || player.player?.id || injury.player?.id;
      if (!playerId || !teamId) continue;

      out.push({
        league,
        teamId,
        teamName,
        playerId,
        playerName: player.full_name || player.name || player.player?.full_name,
        source,
        reportDate,
        rawStatus,
        status: mapStatus(rawStatus),
        description,
        injuryType,
        bodyPart,
        lastSourceUpdateAt: payload?.generated_at || payload?.generated || undefined,
      });
    }
  }

  return out;
}

export function resolveInjuryTruth(args: {
  league?: string;
  leagueInjuries?: any;
  dailyInjuries?: any;
  dailyChangeLog?: any;
  nowIso?: string;
}): ResolvedInjuryRecord[] {
  const nowIso = args.nowIso || new Date().toISOString();
  const league = args.league || 'nba';
  const dailyRecords = extractNormalizedInjuries(args.dailyInjuries, 'daily_injuries', league);
  const leagueRecords = extractNormalizedInjuries(args.leagueInjuries, 'league_injuries', league);
  const records = [...dailyRecords, ...leagueRecords];
  const grouped = new Map<string, NormalizedInjuryRecord[]>();

  for (const record of records) {
    const key = `${record.teamId}:${record.playerId}`;
    const list = grouped.get(key) || [];
    list.push(record);
    grouped.set(key, list);
  }

  const resolved: ResolvedInjuryRecord[] = [];

  for (const [key, list] of grouped.entries()) {
    const sorted = [...list].sort((a, b) => {
      const sourceRank = (src: string) => src === 'daily_injuries' ? 3 : src === 'league_injuries' ? 2 : 1;
      const bySource = sourceRank(b.source) - sourceRank(a.source);
      if (bySource !== 0) return bySource;
      const aTs = parseIsoDate(a.lastSourceUpdateAt) || 0;
      const bTs = parseIsoDate(b.lastSourceUpdateAt) || 0;
      if (aTs !== bTs) return bTs - aTs;
      return normalizeStatusPriority(b.status) - normalizeStatusPriority(a.status);
    });

    const top = sorted[0];
    const rawStatuses = [...new Set(sorted.map((r) => r.rawStatus).filter(Boolean) as string[])];
    const normalizedStatuses = [...new Set(sorted.map((r) => r.status))];
    const conflict = normalizedStatuses.length > 1;
    const stale = (() => {
      const ts = parseIsoDate(top.lastSourceUpdateAt);
      if (!ts) return false;
      return Date.now() - ts > 1000 * 60 * 60 * 4;
    })();

    let resolvedStatus = top.status;
    let confidence = top.source === 'daily_injuries' ? 0.86 : 0.72;
    let resolutionReason = top.source === 'daily_injuries'
      ? 'Using same-day daily injuries as primary source.'
      : 'Using league injuries because no fresher daily injury record was found.';

    if (conflict) {
      const hasOut = normalizedStatuses.includes('OUT');
      const hasAvail = normalizedStatuses.includes('AVAILABLE');
      if (hasOut && hasAvail) {
        resolvedStatus = 'CONFLICTING_REPORTS';
        confidence = 0.4;
        resolutionReason = 'Daily and league injury sources disagree on availability.';
      } else {
        confidence -= 0.15;
        resolutionReason += ' Multiple statuses found; confidence reduced.';
      }
    }

    if (stale) {
      confidence = Math.max(0.25, confidence - 0.2);
      resolutionReason += ' Latest source is stale.';
    }

    resolved.push({
      league,
      teamId: top.teamId,
      teamName: top.teamName,
      playerId: top.playerId,
      playerName: top.playerName,
      resolvedStatus,
      confidence: Number(confidence.toFixed(2)),
      sourcePriorityUsed: sorted.map((r) => r.source),
      conflict,
      stale,
      resolutionReason,
      rawStatuses,
      reportDate: top.reportDate,
      lastChangedAt: top.lastSourceUpdateAt,
      lastCheckedAt: nowIso,
    });
  }

  return resolved.sort((a, b) => {
    if (a.teamName && b.teamName && a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName);
    return (a.playerName || '').localeCompare(b.playerName || '');
  });
}
