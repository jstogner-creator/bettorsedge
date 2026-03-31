/**
 * Multi-sport Injury Resolution System
 * Resolves injury truth across multiple Sportradar sources.
 */

export type InjuryStatus = 
  | 'OUT' 
  | 'DOUBTFUL' 
  | 'QUESTIONABLE' 
  | 'PROBABLE' 
  | 'AVAILABLE' 
  | 'UNKNOWN' 
  | 'CONFLICTING_REPORTS';

export interface ResolvedInjury {
  league: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  resolvedStatus: InjuryStatus;
  confidence: number; // 0-1
  sourcePriorityUsed: string;
  conflict: boolean;
  stale: boolean;
  resolutionReason: string;
  rawStatuses: Record<string, string>;
  lastChangedAt: string;
  lastCheckedAt: string;
}

/**
 * Normalizes various Sportradar status strings into a unified set.
 */
export function normalizeStatus(rawStatus: string): InjuryStatus {
  if (!rawStatus) return 'UNKNOWN';
  
  const s = rawStatus.toUpperCase().trim();
  
  // Negative/Out statuses
  if (s.includes('OUT') || s.includes('INACTIVE') || s.includes('IL') || s.includes('DL') || s.includes('60-DAY') || s.includes('15-DAY') || s.includes('10-DAY')) {
    return 'OUT';
  }
  
  if (s.includes('DOUBTFUL')) return 'DOUBTFUL';
  if (s.includes('QUESTIONABLE')) return 'QUESTIONABLE';
  if (s.includes('PROBABLE')) return 'PROBABLE';
  
  // Positive/Available statuses
  if (s.includes('AVAILABLE') || s.includes('ACTIVE') || s.includes('HEALTHY')) {
    return 'AVAILABLE';
  }
  
  return 'UNKNOWN';
}

/**
 * Resolves the final injury truth from multiple sources.
 */
export function resolveInjuryTruth(
  league: string,
  sources: {
    injuries?: any;
    dailyInjuries?: any;
    dailyChangelog?: any;
  }
): ResolvedInjury[] {
  const playerMap: Record<string, {
    teamId: string;
    teamName: string;
    playerId: string;
    playerName: string;
    statuses: Record<string, string>;
    lastChangedAt?: string;
  }> = {};

  // 1. Process /league/injuries (Season-long injuries)
  if (sources.injuries?.teams) {
    sources.injuries.teams.forEach((team: any) => {
      if (!team.players) return;
      team.players.forEach((player: any) => {
        const id = player.id;
        if (!playerMap[id]) {
          playerMap[id] = {
            teamId: team.id,
            teamName: team.name,
            playerId: player.id,
            playerName: player.full_name,
            statuses: {}
          };
        }
        playerMap[id].statuses['injuries'] = player.status;
        if (player.update_date) playerMap[id].lastChangedAt = player.update_date;
      });
    });
  }

  // 2. Process /daily_injuries
  if (sources.dailyInjuries?.teams) {
    sources.dailyInjuries.teams.forEach((team: any) => {
      if (!team.players) return;
      team.players.forEach((player: any) => {
        const id = player.id;
        if (!playerMap[id]) {
          playerMap[id] = {
            teamId: team.id,
            teamName: team.name,
            playerId: player.id,
            playerName: player.full_name,
            statuses: {}
          };
        }
        playerMap[id].statuses['daily_injuries'] = player.status;
        if (player.update_date && (!playerMap[id].lastChangedAt || player.update_date > playerMap[id].lastChangedAt)) {
          playerMap[id].lastChangedAt = player.update_date;
        }
      });
    });
  }

  // 3. Process /changes (Changelog)
  if (sources.dailyChangelog?.changes) {
    sources.dailyChangelog.changes.forEach((change: any) => {
      if (change.type === 'injury' && change.player) {
        const player = change.player;
        const id = player.id;
        if (!playerMap[id]) return; // Changelog usually applies to existing players
        
        playerMap[id].statuses['changelog'] = player.status;
        if (change.timestamp && (!playerMap[id].lastChangedAt || change.timestamp > playerMap[id].lastChangedAt)) {
          playerMap[id].lastChangedAt = change.timestamp;
        }
      }
    });
  }

  const now = new Date().toISOString();
  
  return Object.values(playerMap).map(p => {
    const rawStatuses = p.statuses;
    const normalized: Record<string, InjuryStatus> = {};
    Object.entries(rawStatuses).forEach(([src, status]) => {
      normalized[src] = normalizeStatus(status);
    });

    const uniqueStatuses = Array.from(new Set(Object.values(normalized)));
    const conflict = uniqueStatuses.length > 1;
    
    // Priority: Changelog > Daily Injuries > Season Injuries
    let resolvedStatus: InjuryStatus = 'UNKNOWN';
    let sourcePriorityUsed = 'none';
    let resolutionReason = 'No data available';
    let confidence = 0.5;

    if (normalized['changelog']) {
      resolvedStatus = normalized['changelog'];
      sourcePriorityUsed = 'changelog';
      resolutionReason = 'Resolved via most recent changelog event';
      confidence = 0.95;
    } else if (normalized['daily_injuries']) {
      resolvedStatus = normalized['daily_injuries'];
      sourcePriorityUsed = 'daily_injuries';
      resolutionReason = 'Resolved via daily injury report';
      confidence = 0.85;
    } else if (normalized['injuries']) {
      resolvedStatus = normalized['injuries'];
      sourcePriorityUsed = 'injuries';
      resolutionReason = 'Resolved via season-long injury report';
      confidence = 0.75;
    }

    if (conflict) {
      if (uniqueStatuses.includes('OUT') && (uniqueStatuses.includes('AVAILABLE') || uniqueStatuses.includes('PROBABLE'))) {
        resolvedStatus = 'CONFLICTING_REPORTS';
        resolutionReason = 'Strong conflict between OUT and AVAILABLE reports';
        confidence = 0.3;
      } else {
        resolutionReason += ' (with minor conflicts)';
        confidence -= 0.1;
      }
    }

    // Freshness check
    let stale = false;
    if (p.lastChangedAt) {
      const lastChange = new Date(p.lastChangedAt).getTime();
      const age = Date.now() - lastChange;
      if (age > 24 * 60 * 60 * 1000) { // 24 hours
        stale = true;
        confidence -= 0.1;
      }
    }

    return {
      league,
      teamId: p.teamId,
      teamName: p.teamName,
      playerId: p.playerId,
      playerName: p.playerName,
      resolvedStatus,
      confidence: Math.max(0, Math.min(1, confidence)),
      sourcePriorityUsed,
      conflict,
      stale,
      resolutionReason,
      rawStatuses,
      lastChangedAt: p.lastChangedAt || 'unknown',
      lastCheckedAt: now
    };
  });
}
