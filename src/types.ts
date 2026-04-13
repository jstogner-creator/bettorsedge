export interface TeamStats {
  last5: string;
  winPercentage: string;
  record: string;
  vsExp?: string; // Performance against expectations (e.g., "4-1 vs Exp")
  total?: string;  // Total performance trend (e.g., "3-2 Total")
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
  kalshiExpectations?: any; // Added
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
  league?: string; // Add league for filtering
  date?: string;   // Add date for filtering (YYYY-MM-DD)
  homeTeam?: string; // Added to support displaying without Game object
  awayTeam?: string; // Added to support displaying without Game object
  winner: string;
  confidence: number; // 1-10
  reasoning: string;
  devilsAdvocate?: string;
  marketSentiment?: string;
  situationalFactors?: string;
  scenarioAnalysis: string;
  hedgingAdvice?: any; // Added
  keyFactors: string[];
  appliedLessons?: string[];
  injuries: {
    team: string;
    player: string;
    status: string;
    impact?: string;
    source_name?: string;
    source_timestamp?: string;
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
  };
  kalshiPrice: number; // 0.01 - 0.99
  winProbability?: number; // Added to match AI output and Dashboard usage
  analysisCost?: number;
  lastUpdated: string;
  groundingUrls?: { title: string; uri: string }[];
  teams?: string[]; // Added teams field
  previousMatchups?: {
    date: string;
    homeScore: number;
    awayScore: number;
    homeTeam: string;
    awayTeam: string;
    lineupChanges?: string;
  }[];
  
  // Simulation Data
  simulationCount?: number;
  
  // MLB Specific
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
  
  // Resolution & Learning
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

  // Quality Assurance
  qaStatus?: 'verified' | 'adjusted' | 'flagged' | 'corrected';
  qaNotes?: string;

  // Trends
  trends?: {
    homeVsExp?: string;
    awayVsExp?: string;
    homeTotal?: string;
    awayTotal?: string;
  };

  // Detailed Matchup Data
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

  // Market Expectations
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

  // Source Auditing
  sourceAudit?: {
    googleDriveAccessed: boolean;
    nbaOfficialAccessed: boolean;
    lastAuditTime: string;
    auditNotes?: string;
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


