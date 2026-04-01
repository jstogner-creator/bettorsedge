export interface TeamStats {
  last5: string;
  winPercentage: string;
  record: string;
  ats?: string; // Against The Spread trend (e.g., "4-1 ATS")
  ou?: string;  // Over/Under trend (e.g., "3-2 O/U")
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
  apiSportsGameId?: number;
  apiSportsHomeTeamId?: number;
  apiSportsAwayTeamId?: number;
  kalshiOdds?: {
    yes: number;
    no: number;
    volume?: number;
  };
  marketOdds?: {
    homeML?: number;
    awayML?: number;
    spread?: number;
    homeSpreadOdds?: number;
    awaySpreadOdds?: number;
    total?: number;
    overOdds?: number;
    underOdds?: number;
    source?: string;
  };
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
  hedgingAdvice: string;
  keyFactors: string[];
  injuries: {
    team: string;
    player: string;
    status: string;
    impact?: string;
  }[];
  scorePrediction?: {
    home: number;
    away: number;
  };
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
    homeATS?: string;
    awayATS?: string;
    homeOU?: string;
    awayOU?: string;
  };

  // Detailed Matchup Data
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

  // Market Odds from Sportradar
  marketOdds?: {
    homeML?: number;
    awayML?: number;
    spread?: number;
    homeSpreadOdds?: number;
    awaySpreadOdds?: number;
    total?: number;
    overOdds?: number;
    underOdds?: number;
    source?: string;
  };

  // Source Auditing
  sourceAudit?: {
    googleDriveAccessed: boolean;
    nbaOfficialAccessed: boolean;
    sportradarInjuriesUsed?: boolean;
    sportradarSummaryUsed?: boolean;
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
  bankroll?: number; // Starting bankroll for paper trading
}

export interface Bet {
  id: string;
  userId: string;
  gameId: string;
  league: string;
  date: string;
  team: string; // The team bet on
  type: 'ML' | 'Spread' | 'Total';
  amount: number;
  odds: number; // Decimal odds or Kalshi price (0-100)
  status: 'pending' | 'won' | 'lost' | 'push';
  payout?: number;
  createdAt: string;
  resolvedAt?: string;
  gameInfo: {
    homeTeam: string;
    awayTeam: string;
    score?: { home: number; away: number };
  };
}
