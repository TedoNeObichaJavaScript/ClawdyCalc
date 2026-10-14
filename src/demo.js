// Made-up usage for `?demo` (screenshots, trying it out with no Claude Code history).
const { buildReport } = require('./report');
const { dayKey } = require('./util');

// mulberry32 by Tommy Ettinger (public domain): https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROJECTS = ['pixel-garden', 'my-saas/api', 'my-saas/web', 'game-jam', 'dotfiles', 'portfolio'];
const MIX = [['claude-opus-5-5', 0.55], ['claude-fable-5-1', 0.18], ['claude-sonnet-5-5', 0.17], ['claude-haiku-5-5', 0.10]];

function pick(r, list) {
  let x = r();
  for (const [v, w] of list) { if ((x -= w) <= 0) return v; }
  return list[0][0];
}

function demoReport(now = Date.now()) {
  const r = rng(42);
  const DAY = 86400000;
  const messages = new Map();
  let id = 0;
  for (let ago = 44; ago >= 0; ago--) {
    if (r() < 0.18 && ago > 0) continue; // a few days off
    const count = Math.round(60 + r() * 220 * (ago < 7 ? 1.4 : 1));
    for (let k = 0; k < count; k++) {
      const ts = ago === 0 ? now - r() * 4 * 3600000 : now - ago * DAY - r() * 10 * 3600000;
      messages.set('demo' + id++, {
        model: pick(r, MIX), ts, project: PROJECTS[Math.floor(r() * r() * PROJECTS.length)], session: 's' + ago,
        input: Math.round(r() * 40), output: Math.round(300 + r() * 1500),
        cw5m: Math.round(r() * 12000), cw1h: 0, cr: Math.round(60000 + r() * 240000),
      });
    }
  }
  const recovered = [];
  for (let ago = 170; ago >= 140; ago--) {
    const day = dayKey(now - ago * DAY);
    for (const model of ['claude-opus-4-7', 'claude-sonnet-4-6']) {
      const f = model.includes('opus') ? 1 : 0.15;
      recovered.push({ key: `stats:${day}:${model}`, source: 'stats', day, model, project: 'older sessions (/stats)',
        n: Math.round(300 * f * r()), input: 200, output: Math.round(240000 * f * r()), cw5m: Math.round(2000000 * f * r()), cw1h: 0,
        cr: Math.round(28000000 * f * r()) });
    }
  }
  for (const [ago, model, project] of [[120, 'claude-opus-4-8', 'game-jam'], [90, 'claude-fable-5', 'pixel-garden'], [60, 'claude-opus-5', 'portfolio']]) {
    recovered.push({ key: `session:old${ago}:${model}`, source: 'session', session: 'old' + ago, day: dayKey(now - ago * DAY), model, project,
      n: 0, input: 900, output: 90000, cw5m: 800000, cw1h: 0, cr: 9000000 });
  }
  const report = buildReport({ messages, knownSessions: new Set(), recovered, firstUse: now - 200 * DAY, now });
  return {
    ...report,
    demo: true,
    files: 37,
    account: { loggedIn: true, name: 'Demo', plan: { id: 'max5', label: 'Max 5x', monthly: 100 },
      firstUse: now - 200 * DAY, subscribedSince: new Date(now - 190 * DAY).toISOString() },
    retention: { days: 30, forever: false },
  };
}

module.exports = { demoReport };
