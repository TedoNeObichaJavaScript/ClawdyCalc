// Source 2: Claude Code's /stats cache (~/.claude/stats-cache.json).
// It keeps exact per-model token totals for the window it last computed, plus a daily
// token count per model. We spread the totals across days using those daily counts.
// The cache gets overwritten the next time /stats runs, so these rows are archived.
const { normalizeModel } = require('../pricing');
const { readJson } = require('../util');

async function readStatsCache(file) {
  const s = await readJson(file);
  if (!s || !s.modelUsage) return [];

  const daily = Array.isArray(s.dailyModelTokens) ? s.dailyModelTokens : [];
  const activity = new Map((s.dailyActivity || []).map((d) => [d.date, d.messageCount || 0]));
  const fallbackDay = s.lastComputedDate || (s.firstSessionDate || '').slice(0, 10);
  const rows = [];

  for (const [rawModel, u] of Object.entries(s.modelUsage)) {
    const weights = daily
      .map((d) => ({ day: d.date, w: (d.tokensByModel && d.tokensByModel[rawModel]) || 0 }))
      .filter((d) => d.day && d.w > 0);
    const totalW = weights.reduce((a, d) => a + d.w, 0);
    const parts = totalW ? weights.map((d) => ({ day: d.day, f: d.w / totalW })) : [{ day: fallbackDay, f: 1 }];

    for (const { day, f } of parts) {
      if (!day) continue;
      // share of that day's messages, by this model's share of the day's tokens
      const dayTotal = daily.find((d) => d.date === day);
      const dayAll = dayTotal ? Object.values(dayTotal.tokensByModel || {}).reduce((a, b) => a + b, 0) : 0;
      const msgShare = dayAll ? ((dayTotal.tokensByModel[rawModel] || 0) / dayAll) : 1;
      rows.push({
        key: `stats:${day}:${rawModel}`,
        source: 'stats',
        day,
        model: normalizeModel(rawModel),
        project: 'older sessions (/stats)',
        n: Math.round((activity.get(day) || 0) * msgShare),
        input: Math.round((u.inputTokens || 0) * f),
        output: Math.round((u.outputTokens || 0) * f),
        cw5m: Math.round((u.cacheCreationInputTokens || 0) * f),
        cw1h: 0,
        cr: Math.round((u.cacheReadInputTokens || 0) * f),
      });
    }
  }
  return rows;
}

module.exports = { readStatsCache };
