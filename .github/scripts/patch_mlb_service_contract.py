from pathlib import Path

p = Path('src/services/apiSportsMlb.ts')
s = p.read_text()
changed = False

# Add MLB league id cache.
old = '  private gamesCache: Map<string, { data: Game[], timestamp: number }> = new Map();\n  private readonly GAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // daily static schedule cache\n'
new = '  private gamesCache: Map<string, { data: Game[], timestamp: number }> = new Map();\n  private readonly GAMES_CACHE_TTL