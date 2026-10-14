// Turns messages + recovered rows into the JSON the page renders.
const { priceMessage } = require('./pricing');
const { dayKey, addDays } = require('./util');

const SUM_FIELDS = ['n', 'input', 'output', 'cw', 'cr', 'cost', 'costInput', 'costOutput', 'costCw', 'costCr'];

function buildReport({ messages, knownSessions, recovered, firstUse, now = Date.now() }) {
  const rows = new Map();
  const unpriced = new Set();

  function add(day, model, project, source, n, rec) {
    const priced = priceMessage(rec);
    if (!priced.known) unpriced.add(model);
    const key = `${day}|${model}|${project}|${source}`;
    let r = rows.get(key);
    if (!r) {
      r = { day, model, project, source };
      for (const f of SUM_FIELDS) r[f] = 0;
      rows.set(key, r);
    }
    r.n += n;
    r.input += rec.input; r.output += rec.output; r.cw += rec.cw5m + rec.cw1h; r.cr += rec.cr;
    r.cost += priced.total; r.costInput += priced.input; r.costOutput += priced.output;
    r.costCw += priced.cacheWrite; r.costCr += priced.cacheRead;
    return priced.total;
  }

  // 1. exact messages (live logs + ClawdyCalc's archive)
  const blockStart = now - 5 * 3600 * 1000;
  const last5h = { cost: 0, tokens: 0, messages: 0, first: null };
  let earliest = null;
  let lastActivity = 0;
  for (const rec of messages.values()) {
    if (!rec.ts) continue;
    const day = dayKey(rec.ts);
    const cost = add(day, rec.model, rec.project, 'log', 1, rec);
    if (!earliest || day < earliest) earliest = day;
    if (rec.ts > lastActivity) lastActivity = rec.ts;
    if (rec.ts >= blockStart) {
      last5h.cost += cost;
      last5h.tokens += rec.input + rec.output + rec.cw5m + rec.cw1h + rec.cr;
      last5h.messages++;
      if (!last5h.first || rec.ts < last5h.first) last5h.first = rec.ts;
    }
  }

  // 2. /stats cache: only for days the exact logs don't cover
  const stats = recovered.filter((r) => r.source === 'stats' && (!earliest || r.day < earliest));
  let statsFrom = null, statsTo = null;
  for (const r of stats) {
    add(r.day, r.model, r.project, 'stats', r.n, { ...r, aggregate: true });
    if (!statsFrom || r.day < statsFrom) statsFrom = r.day;
    if (!statsTo || r.day > statsTo) statsTo = r.day;
  }

  // 3. last-session totals whose logs are gone and that the stats window doesn't cover
  const sessions = recovered.filter((r) => r.source === 'session'
    && !knownSessions.has(r.session)
    && (!earliest || r.day < earliest)
    && !(statsFrom && r.day >= statsFrom && r.day <= statsTo));
  const sessionIds = new Set();
  let sessionCost = 0;
  for (const r of sessions) {
    sessionCost += add(r.day, r.model, r.project, 'session', r.n, { ...r, aggregate: true });
    sessionIds.add(r.session);
  }

  // 4. coverage timeline + a rough estimate for days with no data at all
  const allRows = [...rows.values()];
  const today = dayKey(now);
  let start = firstUse ? dayKey(firstUse) : null;
  for (const r of allRows) if (!start || r.day < start) start = r.day;
  const segments = [];
  let knownDays = 0, gapDays = 0;
  const gapByMonth = {};
  if (start) {
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const kind = earliest && d >= earliest ? 'exact'
        : statsFrom && d >= statsFrom && d <= statsTo ? 'recovered' : 'none';
      if (kind === 'none') { gapDays++; gapByMonth[d.slice(0, 7)] = (gapByMonth[d.slice(0, 7)] || 0) + 1; }
      else knownDays++;
      const last = segments[segments.length - 1];
      if (last && last.kind === kind) last.to = d;
      else segments.push({ from: d, to: d, kind });
    }
  }
  const knownCost = allRows.filter((r) => r.source !== 'session').reduce((a, r) => a + r.cost, 0);
  const avgPerDay = knownDays ? knownCost / knownDays : 0;
  const rawEstimate = avgPerDay * gapDays;
  const estTotal = Math.max(0, rawEstimate - sessionCost);
  const byMonth = {};
  for (const [m, days] of Object.entries(gapByMonth)) byMonth[m] = rawEstimate ? (days * avgPerDay) * (estTotal / rawEstimate) : 0;

  return {
    generatedAt: now,
    messages: messages.size,
    lastActivity,
    last5h,
    unpriced: [...unpriced],
    rows: allRows,
    coverage: { start, today, segments, exactFrom: earliest, statsFrom, statsTo, recoveredSessions: sessionIds.size },
    estimate: { total: estTotal, gapDays, avgPerDay, byMonth },
  };
}

module.exports = { buildReport };
