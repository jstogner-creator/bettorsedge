# NBA resolved injuries route wiring

Add this near your other Sportradar routes in `server.ts` after the existing `/api/sportradar/daily-injuries` route.

```ts
import { resolveInjuryTruth } from './injuryResolver';
```

```ts
app.get('/api/sportradar/resolved-injuries', authenticate, async (req, res) => {
  try {
    const { league = 'nba', year, month, day } = req.query as Record<string, string>;
    const apiKey = process.env.SPORTRADAR_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Sportradar API key not configured' });

    const now = new Date();
    const y = year || String(now.getUTCFullYear());
    const m = month || String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = day || String(now.getUTCDate()).padStart(2, '0');

    const cacheKey = `sr-resolved-injuries-${league}-${y}-${m}-${d}`;
    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
      return res.json(cachedData);
    }

    const [leagueResp, dailyResp, changeResp] = await Promise.allSettled([
      fetchWithRetry(`${req.protocol}://${req.get('host')}/api/sportradar/injuries?league=${league}`),
      fetchWithRetry(`${req.protocol}://${req.get('host')}/api/sportradar/daily-injuries?league=${league}&year=${y}&month=${m}&day=${d}`),
      fetchWithRetry(`${req.protocol}://${req.get('host')}/api/sportradar/daily-changelog?league=${league}&year=${y}&month=${m}&day=${d}`),
    ]);

    const leagueInjuries = leagueResp.status === 'fulfilled' ? leagueResp.value.data : null;
    const dailyInjuries = dailyResp.status === 'fulfilled' ? dailyResp.value.data : null;
    const dailyChangeLog = changeResp.status === 'fulfilled' ? changeResp.value.data : null;

    const resolved = resolveInjuryTruth({
      league,
      leagueInjuries,
      dailyInjuries,
      dailyChangeLog,
      nowIso: new Date().toISOString(),
    });

    const payload = {
      league,
      date: `${y}-${m}-${d}`,
      generatedAt: new Date().toISOString(),
      counts: {
        resolved: resolved.length,
        out: resolved.filter((r) => r.resolvedStatus === 'OUT').length,
        doubtful: resolved.filter((r) => r.resolvedStatus === 'DOUBTFUL').length,
        questionable: resolved.filter((r) => r.resolvedStatus === 'QUESTIONABLE').length,
        probable: resolved.filter((r) => r.resolvedStatus === 'PROBABLE').length,
        available: resolved.filter((r) => r.resolvedStatus === 'AVAILABLE').length,
        conflicts: resolved.filter((r) => r.resolvedStatus === 'CONFLICTING_REPORTS').length,
      },
      records: resolved,
      sourceHealth: {
        leagueInjuries: leagueResp.status,
        dailyInjuries: dailyResp.status,
        dailyChangeLog: changeResp.status,
      },
    };

    const nowHour = new Date().getHours();
    const ttl = nowHour >= 16 ? 5 * 60 * 1000 : 15 * 60 * 1000;
    apiCache.set(cacheKey, payload, ttl);

    return res.json(payload);
  } catch (error: any) {
    console.error('[Sportradar Proxy] ERROR resolving injuries:', error.message);
    return res.status(error.response?.status || 500).json({
      error: 'Failed to resolve injuries',
      details: error.message,
    });
  }
});
```

## Recommended follow-up

- Reduce `/api/sportradar/injuries` cache from 60 minutes to 15 minutes.
- Reduce `/api/sportradar/daily-injuries` cache to 5 minutes inside two hours of tip.
- Have the frontend read `/api/sportradar/resolved-injuries` instead of raw injuries feeds.
- Display `resolvedStatus`, `confidence`, `conflict`, `stale`, and `lastCheckedAt`.
