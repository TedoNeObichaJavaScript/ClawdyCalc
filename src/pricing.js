// API list prices in USD per million tokens (first-party Claude API, standard tier).
// cacheRead is listed explicitly because it isn't a flat 0.1x on every model.
// Cache writes are priced from input: 1.25x for the 5-minute TTL, 2x for the 1-hour TTL.
const PRICING = {
  'claude-fable-5-1':  { name: 'Fable 5.1',  family: 'fable',  input: 10,   output: 50,   cacheRead: 0.25 },
  'claude-mythos-5-1': { name: 'Mythos 5.1', family: 'fable',  input: 10,   output: 50,   cacheRead: 0.25 },
  'claude-fable-5':    { name: 'Fable 5',    family: 'fable',  input: 10,   output: 50,   cacheRead: 1.00 },
  'claude-mythos-5':   { name: 'Mythos 5',   family: 'fable',  input: 10,   output: 50,   cacheRead: 1.00 },
  'claude-opus-5-5':   { name: 'Opus 5.5',   family: 'opus',   input: 4,    output: 20,   cacheRead: 0.20 },
  'claude-opus-5':     { name: 'Opus 5',     family: 'opus',   input: 5,    output: 25,   cacheRead: 0.50 },
  'claude-opus-4-8':   { name: 'Opus 4.8',   family: 'opus',   input: 5,    output: 25,   cacheRead: 0.50 },
  'claude-opus-4-7':   { name: 'Opus 4.7',   family: 'opus',   input: 5,    output: 25,   cacheRead: 0.50 },
  'claude-opus-4-6':   { name: 'Opus 4.6',   family: 'opus',   input: 5,    output: 25,   cacheRead: 0.50 },
  'claude-opus-4-5':   { name: 'Opus 4.5',   family: 'opus',   input: 5,    output: 25,   cacheRead: 0.50 },
  'claude-opus-4-1':   { name: 'Opus 4.1',   family: 'opus',   input: 15,   output: 75,   cacheRead: 1.50 },
  'claude-opus-4':     { name: 'Opus 4',     family: 'opus',   input: 15,   output: 75,   cacheRead: 1.50 },
  'claude-3-opus':     { name: 'Opus 3',     family: 'opus',   input: 15,   output: 75,   cacheRead: 1.50 },
  'claude-sonnet-5-5': { name: 'Sonnet 5.5', family: 'sonnet', input: 2,    output: 10,   cacheRead: 0.20 },
  'claude-sonnet-5':   { name: 'Sonnet 5',   family: 'sonnet', input: 2,    output: 10,   cacheRead: 0.20 },
  'claude-sonnet-4-6': { name: 'Sonnet 4.6', family: 'sonnet', input: 3,    output: 15,   cacheRead: 0.30 },
  'claude-sonnet-4-5': { name: 'Sonnet 4.5', family: 'sonnet', input: 3,    output: 15,   cacheRead: 0.30 },
  'claude-sonnet-4':   { name: 'Sonnet 4',   family: 'sonnet', input: 3,    output: 15,   cacheRead: 0.30 },
  'claude-3-7-sonnet': { name: 'Sonnet 3.7', family: 'sonnet', input: 3,    output: 15,   cacheRead: 0.30 },
  'claude-3-5-sonnet': { name: 'Sonnet 3.5', family: 'sonnet', input: 3,    output: 15,   cacheRead: 0.30 },
  // Haiku 5.5 has a long-prompt tier above 100K input tokens (see longContext).
  'claude-haiku-5-5':  { name: 'Haiku 5.5',  family: 'haiku',  input: 0.10, output: 0.50, cacheRead: 0.01,
    longContext: { threshold: 100000, input: 0.50, output: 2.50, cacheRead: 0.05 } },
  'claude-haiku-4-5':  { name: 'Haiku 4.5',  family: 'haiku',  input: 1,    output: 5,    cacheRead: 0.10 },
  'claude-3-5-haiku':  { name: 'Haiku 3.5',  family: 'haiku',  input: 0.80, output: 4,    cacheRead: 0.08 },
  'claude-3-haiku':    { name: 'Haiku 3',    family: 'haiku',  input: 0.25, output: 1.25, cacheRead: 0.03 },
};

const FAST_MODE_MULTIPLIER = 2; // Opus 5 / 5.5 fast mode is 2x standard

// "claude-opus-4-5-20251101" -> "claude-opus-4-5", "claude-sonnet-4-0" -> "claude-sonnet-4"
function normalizeModel(raw) {
  let m = String(raw).toLowerCase().replace(/^(anthropic\.|us\.anthropic\.)/, '').replace(/@.*$/, '');
  m = m.replace(/\[.*\]$/, '').replace(/-v\d+(:\d+)?$/, '').replace(/-\d{8}$/, '');
  m = m.replace(/-0$/, '');
  return m;
}

function lookup(model) {
  if (PRICING[model]) return PRICING[model];
  // fall back to the longest known prefix, e.g. a future dated variant
  const key = Object.keys(PRICING).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : null;
}

function priceMessage(rec) {
  let p = lookup(rec.model);
  const known = !!p;
  if (!p) {
    // unknown model: guess by family so it still shows up roughly right
    const fam = /fable|mythos/.test(rec.model) ? 'claude-fable-5-1' : /haiku/.test(rec.model) ? 'claude-haiku-5-5'
      : /sonnet/.test(rec.model) ? 'claude-sonnet-5-5' : 'claude-opus-5-5';
    p = PRICING[fam];
  }
  let rates = p;
  // the long-prompt tier is per request, so it can't be applied to pre-summed rows
  if (p.longContext && !rec.aggregate && rec.input + rec.cr + rec.cw5m + rec.cw1h > p.longContext.threshold) {
    rates = { ...p, ...p.longContext };
  }
  const mult = rec.speed === 'fast' ? FAST_MODE_MULTIPLIER : 1;
  const M = 1e6;
  const input = (rec.input * rates.input) / M * mult;
  const output = (rec.output * rates.output) / M * mult;
  const cacheWrite = ((rec.cw5m * rates.input * 1.25) + (rec.cw1h * rates.input * 2)) / M * mult;
  const cacheRead = (rec.cr * rates.cacheRead) / M * mult;
  return { known, input, output, cacheWrite, cacheRead, total: input + output + cacheWrite + cacheRead };
}

function planFromAccount(o) {
  const type = String(o.organizationType || '');
  const tier = String(o.organizationRateLimitTier || o.userRateLimitTier || '');
  if (type.includes('max')) {
    if (tier.includes('20x')) return { id: 'max20', label: 'Max 20x', monthly: 200 };
    return { id: 'max5', label: 'Max 5x', monthly: 100 };
  }
  if (type.includes('pro')) return { id: 'pro', label: 'Pro', monthly: 20 };
  if (type.includes('team')) return { id: 'team', label: 'Team', monthly: null };
  if (type.includes('enterprise')) return { id: 'enterprise', label: 'Enterprise', monthly: null };
  if (o.billingType && !String(o.billingType).includes('subscription')) return { id: 'api', label: 'API', monthly: null };
  return { id: 'unknown', label: 'Subscription', monthly: null };
}

module.exports = { PRICING, normalizeModel, priceMessage, planFromAccount };
