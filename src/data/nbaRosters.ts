
export interface NBATeamRoster {
  teamName: string;
  abbreviation: string;
  keyPlayers: string[];
  injuryReportLink: string;
  rosterVerificationLink: string;
}

export const NBA_ROSTER_DATABASE: Record<string, NBATeamRoster> = {
  "Atlanta Hawks": {
    teamName: "Atlanta Hawks",
    abbreviation: "ATL",
    keyPlayers: ["Trae Young", "Jalen Johnson", "Zaccharie Risacher", "Clint Capela", "Dyson Daniels"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=ATL",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/atl/atlanta-hawks"
  },
  "Boston Celtics": {
    teamName: "Boston Celtics",
    abbreviation: "BOS",
    keyPlayers: ["Jayson Tatum", "Jaylen Brown", "Kristaps Porzingis", "Derrick White", "Jrue Holiday"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=BOS",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/bos/boston-celtics"
  },
  "Brooklyn Nets": {
    teamName: "Brooklyn Nets",
    abbreviation: "BKN",
    keyPlayers: ["Cam Thomas", "Nic Claxton", "Cameron Johnson", "Dennis Schroder", "Ben Simmons"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=BKN",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/bkn/brooklyn-nets"
  },
  "Charlotte Hornets": {
    teamName: "Charlotte Hornets",
    abbreviation: "CHA",
    keyPlayers: ["LaMelo Ball", "Brandon Miller", "Miles Bridges", "Mark Williams", "Tidjane Salaun"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=CHA",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/cha/charlotte-hornets"
  },
  "Chicago Bulls": {
    teamName: "Chicago Bulls",
    abbreviation: "CHI",
    keyPlayers: ["Zach LaVine", "Coby White", "Josh Giddey", "Nikola Vucevic", "Patrick Williams"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=CHI",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/chi/chicago-bulls"
  },
  "Cleveland Cavaliers": {
    teamName: "Cleveland Cavaliers",
    abbreviation: "CLE",
    keyPlayers: ["Donovan Mitchell", "Darius Garland", "Evan Mobley", "Jarrett Allen", "Caris LeVert"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=CLE",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/cle/cleveland-cavaliers"
  },
  "Dallas Mavericks": {
    teamName: "Dallas Mavericks",
    abbreviation: "DAL",
    keyPlayers: ["Luka Doncic", "Kyrie Irving", "Klay Thompson", "Dereck Lively II", "P.J. Washington"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=DAL",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/dal/dallas-mavericks"
  },
  "Denver Nuggets": {
    teamName: "Denver Nuggets",
    abbreviation: "DEN",
    keyPlayers: ["Nikola Jokic", "Jamal Murray", "Michael Porter Jr.", "Aaron Gordon", "Russell Westbrook"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=DEN",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/den/denver-nuggets"
  },
  "Detroit Pistons": {
    teamName: "Detroit Pistons",
    abbreviation: "DET",
    keyPlayers: ["Cade Cunningham", "Jaden Ivey", "Jalen Duren", "Tobias Harris", "Ausar Thompson"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=DET",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/det/detroit-pistons"
  },
  "Golden State Warriors": {
    teamName: "Golden State Warriors",
    abbreviation: "GSW",
    keyPlayers: ["Stephen Curry", "Draymond Green", "Andrew Wiggins", "Jonathan Kuminga", "Brandin Podziemski"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=GSW",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/gsw/golden-state-warriors"
  },
  "Houston Rockets": {
    teamName: "Houston Rockets",
    abbreviation: "HOU",
    keyPlayers: ["Alperen Sengun", "Jalen Green", "Fred VanVleet", "Jabari Smith Jr.", "Amen Thompson"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=HOU",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/hou/houston-rockets"
  },
  "Indiana Pacers": {
    teamName: "Indiana Pacers",
    abbreviation: "IND",
    keyPlayers: ["Tyrese Haliburton", "Pascal Siakam", "Myles Turner", "Bennedict Mathurin", "Andrew Nembhard"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=IND",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/ind/indiana-pacers"
  },
  "Los Angeles Clippers": {
    teamName: "Los Angeles Clippers",
    abbreviation: "LAC",
    keyPlayers: ["Kawhi Leonard", "James Harden", "Ivica Zubac", "Norman Powell", "Terance Mann"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=LAC",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/lac/los-angeles-clippers"
  },
  "Los Angeles Lakers": {
    teamName: "Los Angeles Lakers",
    abbreviation: "LAL",
    keyPlayers: ["Anthony Davis", "LeBron James", "Austin Reaves", "Rui Hachimura", "D'Angelo Russell"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=LAL",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/lal/los-angeles-lakers"
  },
  "Memphis Grizzlies": {
    teamName: "Memphis Grizzlies",
    abbreviation: "MEM",
    keyPlayers: ["Ja Morant", "Desmond Bane", "Jaren Jackson Jr.", "Marcus Smart", "Zach Edey"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=MEM",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/mem/memphis-grizzlies"
  },
  "Miami Heat": {
    teamName: "Miami Heat",
    abbreviation: "MIA",
    keyPlayers: ["Jimmy Butler", "Bam Adebayo", "Tyler Herro", "Terry Rozier", "Jaime Jaquez Jr."],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=MIA",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/mia/miami-heat"
  },
  "Milwaukee Bucks": {
    teamName: "Milwaukee Bucks",
    abbreviation: "MIL",
    keyPlayers: ["Giannis Antetokounmpo", "Damian Lillard", "Khris Middleton", "Brook Lopez", "Bobby Portis"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=MIL",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/mil/milwaukee-bucks"
  },
  "Minnesota Timberwolves": {
    teamName: "Minnesota Timberwolves",
    abbreviation: "MIN",
    keyPlayers: ["Anthony Edwards", "Julius Randle", "Rudy Gobert", "Jaden McDaniels", "Mike Conley"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=MIN",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/min/minnesota-timberwolves"
  },
  "New Orleans Pelicans": {
    teamName: "New Orleans Pelicans",
    abbreviation: "NOP",
    keyPlayers: ["Zion Williamson", "Brandon Ingram", "Dejounte Murray", "CJ McCollum", "Herbert Jones"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=NOP",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/nop/new-orleans-pelicans"
  },
  "New York Knicks": {
    teamName: "New York Knicks",
    abbreviation: "NYK",
    keyPlayers: ["Jalen Brunson", "Karl-Anthony Towns", "OG Anunoby", "Josh Hart", "Mikal Bridges"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=NYK",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/nyk/new-york-knicks"
  },
  "Oklahoma City Thunder": {
    teamName: "Oklahoma City Thunder",
    abbreviation: "OKC",
    keyPlayers: ["Shai Gilgeous-Alexander", "Chet Holmgren", "Jalen Williams", "Isaiah Hartenstein", "Alex Caruso"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=OKC",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/okc/oklahoma-city-thunder"
  },
  "Orlando Magic": {
    teamName: "Orlando Magic",
    abbreviation: "ORL",
    keyPlayers: ["Paolo Banchero", "Franz Wagner", "Jalen Suggs", "Kentavious Caldwell-Pope", "Wendell Carter Jr."],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=ORL",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/orl/orlando-magic"
  },
  "Philadelphia 76ers": {
    teamName: "Philadelphia 76ers",
    abbreviation: "PHI",
    keyPlayers: ["Joel Embiid", "Paul George", "Tyrese Maxey", "Kelly Oubre Jr.", "Caleb Martin"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=PHI",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/phi/philadelphia-76ers"
  },
  "Phoenix Suns": {
    teamName: "Phoenix Suns",
    abbreviation: "PHX",
    keyPlayers: ["Kevin Durant", "Devin Booker", "Bradley Beal", "Tyus Jones", "Jusuf Nurkic"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=PHX",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/phx/phoenix-suns"
  },
  "Portland Trail Blazers": {
    teamName: "Portland Trail Blazers",
    abbreviation: "POR",
    keyPlayers: ["Anfernee Simons", "Jerami Grant", "Deandre Ayton", "Scoot Henderson", "Shaedon Sharpe"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=POR",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/por/portland-trail-blazers"
  },
  "Sacramento Kings": {
    teamName: "Sacramento Kings",
    abbreviation: "SAC",
    keyPlayers: ["De'Aaron Fox", "Domantas Sabonis", "DeMar DeRozan", "Keegan Murray", "Malik Monk"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=SAC",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/sac/sacramento-kings"
  },
  "San Antonio Spurs": {
    teamName: "San Antonio Spurs",
    abbreviation: "SAS",
    keyPlayers: ["Victor Wembanyama", "Chris Paul", "Devin Vassell", "Jeremy Sochan", "Harrison Barnes"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=SAS",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/sas/san-antonio-spurs"
  },
  "Toronto Raptors": {
    teamName: "Toronto Raptors",
    abbreviation: "TOR",
    keyPlayers: ["Scottie Barnes", "RJ Barrett", "Immanuel Quickley", "Jakob Poeltl", "Gradey Dick"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=TOR",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/tor/toronto-raptors"
  },
  "Utah Jazz": {
    teamName: "Utah Jazz",
    abbreviation: "UTA",
    keyPlayers: ["Lauri Markkanen", "Walker Kessler", "Collin Sexton", "Keyonte George", "John Collins"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=UTA",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/uta/utah-jazz"
  },
  "Washington Wizards": {
    teamName: "Washington Wizards",
    abbreviation: "WAS",
    keyPlayers: ["Jordan Poole", "Kyle Kuzma", "Alex Sarr", "Bilal Coulibaly", "Malcolm Brogdon"],
    injuryReportLink: "https://www.rotowire.com/basketball/injury-report.php?team=WAS",
    rosterVerificationLink: "https://www.espn.com/nba/team/roster/_/name/was/washington-wizards"
  }
};

export const GLOBAL_INJURY_LINKS = {
  ROTOWIRE: "https://www.rotowire.com/basketball/injury-report.php",
  ESPN: "https://www.espn.com/nba/injuries",
  OFFICIAL_NBA: "https://official.nba.com/nba-injury-report/"
};

export const GLOBAL_ROSTER_LINKS = {
  ESPN_PLAYERS: "https://www.espn.com/nba/players",
  NBA_TEAMS: "https://www.nba.com/teams"
};
