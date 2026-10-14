// Source 3: per-project "last session" totals in ~/.claude.json.
// Claude Code remembers the token usage of the most recent session in each project, even
// after that session's log is deleted. Each new session in the project overwrites it, so
// these rows are archived too.
const { normalizeModel } = require('../pricing');
const { readJson, dayKey, projectName } = require('../util');

async function readLastSessions(file) {
  const j = await readJson(file);
  if (!j || !j.projects) return [];
  const rows = [];
  for (const [dir, p] of Object.entries(j.projects)) {
    if (!p || !p.lastSessionId || !p.lastModelUsage) continue;
    const ts = Number(p.lastStartTime) || Date.parse(p.lastStartTime) || 0;
    if (!ts) continue;
    for (const [rawModel, u] of Object.entries(p.lastModelUsage)) {
      if (!u) continue;
      rows.push({
        key: `session:${p.lastSessionId}:${rawModel}`,
        source: 'session',
        session: p.lastSessionId,
        day: dayKey(ts),
        model: normalizeModel(rawModel),
        project: projectName(dir),
        n: 0,
        input: u.inputTokens || 0,
        output: u.outputTokens || 0,
        cw5m: u.cacheCreationInputTokens || 0,
        cw1h: 0,
        cr: u.cacheReadInputTokens || 0,
      });
    }
  }
  return rows;
}

module.exports = { readLastSessions };
