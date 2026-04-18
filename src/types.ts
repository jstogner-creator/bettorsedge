export interface TeamStats {
  last5: string;
  winPercentage: string;
  record: string;
  vsExp?: string;
  total?: string;
}

export interface Game {
  id: string;
  league: 'NBA' | 'NCAA' | 'NHL' | 'NFL' | 'MLB';
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  homeTeamStats?: TeamStats;
  awayTeamStats?: TeamStats;
  date: string;
  time: string;
  location: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore?: number;
  awayScore?: number;
  kalshiTicker?: string;
  kalshiMarketTitle?: string;
  kalshiExpectations?: any;
  apiSportsGameId?: number;
  apiSportsHomeTeamId?: number;
  apiSportsAwayTeamId?: number;
  kalshiOdds?: {
    yes: number;
    no: number;
    volume?: number;
  };
  marketExpectations?: {
    homeWinProb?: number;
    awayWinProb?: number;
    margin?: number;
    homeMarginOdds?: number;
    awayMarginOdds?: number;
    total?: number;
    overOdds?: number;
    underOdds?: number;
    source?: string;
  };
  allSources?: Array<{
    id: number;
    name: string;
    homeWinProb?: number;
    awayWinProb?: number;
    margin?: number;
    total?: number;
  }>;
}

export interface Prediction {
  gameId: string;
  league?: string;
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  winner: string;
  confidence: number;
  reasoning: string;
  devilsAdvocate?: string;
  marketSentiment?: string;
  situationalFactors?: string;
  scenarioAnalysis: string;
  hedgingAdvice?: any;
  keyFactors: string[];
  appliedLessons?: string[];
  injuries: {
    team: string;
    player: string;
    status: string;
    impact?: string;
    source_name?: string;
    source_timestamp?: string;
    source_priority?: number;
    update?: string;
  }[];
  scorePrediction?: {
    home: number;
    away: number;
  };
  projectedTotal?: number;
  recommendedTotalLine?: string;
  matchupRankings?: {
    homeRank: number | string;
    awayRank: number | string;
    homeOffenseRank: number | string;
    awayOffenseRank: number | string;
    homeDefenseRank: number | string;
    awayDefenseRank: number | string;
    homeShootingRank?: number | string;
    awayShootingRank?: number | string;
    homeReboundingRank?: number | string;
    awayReboundingRank?: number | string;
    homeTurnoverRank?: number | string;
    awayTurnoverRank?: number | string;
    homeBenchRank?: number | string;
    awayBenchRank?: number | string;
  };
  kalshiPrice: number;
  winProbability?: number;
  analysisCost?: number;
  lastUpdated: string;
  groundingUrls?: { title: string; uri: string }[];
  teams?: string[];
  previousMatchups?: {
    date: string;
    homeScore: number;
    awayScore: number;
    homeTeam: string;
    awayTeam: string;
    lineupChanges?: string;
    significantChanges?: string[];
    injuryContext?: string;
    venue?: string;
    winner?: string;
    margin?: number;
  }[];

  simulationCount?: number;

  pitcherMatchup?: {
    homePitcher: {
      name: string;
      era: number | string;
      whip: number | string;
      xERA?: number | string;
      fip?: number | string;
      k9?: number | string;
      bb9?: number | string;
      barrelRate?: string;
      recentForm: string;
    };
    awayPitcher: {
      name: string;
      era: number | string;
      whip: number | string;
      xERA?: number | string;
      fip?: number | string;
      k9?: number | string;
      bb9?: number | string;
      barrelRate?: string;
      recentForm: string;
    };
    weatherImpact?: string;
    parkFactor?: string;
    umpire?: {
      name: string;
      runsPerGame?: number | string;
      strikeZone?: string;
    };
    summary?: string;
  };

  actualWinner?: string;
  actualScore?: {
    home: number;
    away: number;
  };
  outcome?: 'correct' | 'incorrect' | 'push';
  postMortem?: {
    analysis: string;
    keyMissedFactor: string;
    lessonLearned: string;
    analyzedAt: string;
  };

  qaStatus?: 'verified' | 'adjusted' | 'flagged' | 'corrected';
  qaNotes?: string;

  trends?: {
    homeVsExp?: string;
    awayVsExp?: string;
    homeTotal?: string;
    awayTotal?: string;
  };

  matchupAnalysis?: {
    h2h: string;
    playerStats: string;
    trends: string;
    confidenceBreakdown: string;
  };

  playerMatchups?: {
    matchup: string;
    analysis: string;
    advantage: string;
  }[];

  teamStatsComparison?: {
    category: string;
    homeValue: number | string;
    awayValue: number | string;
    advantage: 'home' | 'away' | 'neutral';
  }[];

  marketExpectations?: {
    homeWinProb?: number;
    awayWinProb?: number;
    margin?: number;
    homeMarginOdds?: number;
    awayMarginOdds?: number;
    total?: number;
    overOdds?: number;
    underOdds?: number;
    source?: string;
  };

  sourceAudit?: {
    googleDriveAccessed: boolean;
    nbaOfficialAccessed: boolean;
    lastAuditTime: string;
    auditNotes?: string;
  };

  dataQuality?: {
    injuryFreshnessOk?: boolean;
    injuryFreshestTimestamp?: string;
    staleInjuryCount?: number;
    unresolvedInjuryCount?: number;
    availabilityConfidencePenalty?: number;
    analysisMode?: 'expected' | 'confirmed' | 'mixed';
    matchupHistoryCount?: number;
    sameSeasonMatchupsFound?: boolean;
    freshnessCheckedAt?: string;
  };
}

export interface BracketRound {
  name: string;
  games: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeSeed?: number;
    awaySeed?: number;
    homeScore?: number;
    awayScore?: number;
    winner?: string;
    status: 'scheduled' | 'live' | 'finished';
    date: string;
  }[];
}

export interface TournamentBracket {
  league: string;
  year: number;
  rounds: BracketRound[];
  lastUpdated: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface KalshiMarket {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role?: 'admin' | 'user';
  subscriptionStatus?: 'active' | 'inactive' | 'past_due' | 'canceled';
  subscribedSports?: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt?: string;
  hasSeenWalkthrough?: boolean;
  acceptedTerms?: boolean;
  termsAcceptedAt?: string;
}
<<<<<<< HEAD



=======
>>>>>>> d379c3ddc776678b2a240d27e2d07e022631ff6b
