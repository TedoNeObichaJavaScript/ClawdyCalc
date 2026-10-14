(function () {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const POLL_MS = 2000;
  const HIDDEN_POLL_MS = 5 * 60 * 1000;
  const DEMO = new URLSearchParams(location.search).has('demo');
  const LOCALE = 'en-US'; // the UI copy is English, so keep dates English too

  const PLANS = {
    pro: { label: 'Pro', monthly: 20 },
    max5: { label: 'Max 5x', monthly: 100 },
    max20: { label: 'Max 20x', monthly: 200 },
    api: { label: 'API', monthly: null },
  };

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  let data = null;
  let range = store.get('cc.range', '7d');
  let includeEst = store.get('cc.est', '0') === '1';
  let theme = Themes.get(store.get('cc.theme', 'claude'));
  let lastFetch = 0;
  let prevModelCost = null;
  let lastBody = '';
  const bigCounter = createCounter($('big'));

  // ---------- formatting ----------
  const money = (n) => {
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    if (n > 0 && n < 0.01) return '<$0.01';
    return '$' + n.toFixed(2);
  };
  const tokens = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  };
  const num = (n) => n.toLocaleString('en-US');
  const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daysAgo(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; }
  const fromKey = (k) => new Date(k + 'T12:00:00');
  function niceDate(k, withYear) {
    const d = fromKey(k);
    const opts = { month: 'short', day: 'numeric' };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(LOCALE, opts);
  }

  const RANGE_LABEL = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', month: 'this month', all: 'all time' };

  function inRange(day, r) {
    if (r === 'all') return true;
    if (r === 'today') return day === dayKey(new Date());
    if (r === '7d') return day >= dayKey(daysAgo(6));
    if (r === '30d') return day >= dayKey(daysAgo(29));
    if (r === 'month') return day.slice(0, 7) === dayKey(new Date()).slice(0, 7);
    return true;
  }

  function sum(rows) {
    const t = { n: 0, input: 0, output: 0, cw: 0, cr: 0, cost: 0, costInput: 0, costOutput: 0, costCw: 0, costCr: 0 };
    for (const r of rows) for (const k in t) t[k] += r[k];
    t.tokens = t.input + t.output + t.cw + t.cr;
    return t;
  }

  function groupBy(rows, key) {
    const m = new Map();
    for (const r of rows) {
      const k = r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].map(([k, rs]) => ({ key: k, rows: rs, ...sum(rs) })).sort((a, b) => b.cost - a.cost);
  }

  const modelName = (id) => (data && data.pricing[id] && data.pricing[id].name) || id.replace(/^claude-/, '');
  const rowsIn = (r) => data.rows.filter((row) => inRange(row.day, r));
  const estimateOn = () => includeEst && data.estimate && data.estimate.total > 0;

  // ---------- rendering ----------
  function render() {
    if (!data) return;
    const rows = rowsIn(range);
    const t = sum(rows);

    for (const b of $('ranges').children) b.setAttribute('aria-selected', String(b.dataset.range === range));

    const withEst = range === 'all' && estimateOn();
    const shown = t.cost + (withEst ? data.estimate.total : 0);
    bigCounter.set(shown, { approx: withEst });
    $('sub').textContent = !t.n && !t.cost
      ? `No Claude Code activity ${RANGE_LABEL[range]}`
      : `${tokens(t.tokens)} tokens · ${plural(t.n, 'message')} · ${RANGE_LABEL[range]}`
        + (withEst ? ` · incl. ~${money(data.estimate.total)} estimated` : '');

    renderRetention();
    renderValue();
    renderLifetime();
    renderBlock();
    renderChart();
    renderHighlights(rows);
    renderModels(rows, t);
    renderKinds(t);
    renderProjects(rows);
    renderFoot();
    stage.relabel();
    if (window.ClawdyDesktop) {
      window.ClawdyDesktop.summary(`Today ${money(sum(rowsIn('today')).cost)} · This month ${money(sum(rowsIn('month')).cost)}`);
    }
  }

  function currentPlan() {
    const pick = store.get('cc.plan', 'auto');
    if (pick !== 'auto' && PLANS[pick]) return { id: pick, ...PLANS[pick] };
    return (data.account && data.account.plan) || { id: 'unknown', label: 'Subscription', monthly: null };
  }

  function renderRetention() {
    const r = data.retention;
    let snoozed = false;
    try { snoozed = Date.now() < Number(localStorage.getItem('cc.retentionSnooze') || 0); } catch {}
    const show = r && !r.forever && !data.demo && !snoozed;
    $('retention').hidden = !show;
    if (show) $('retentionDays').textContent = r.days;
  }

  function renderValue() {
    const plan = currentPlan();
    const month = sum(rowsIn('month'));
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsed = now.getDate() - 1 + now.getHours() / 24;
    const pace = elapsed > 0.5 ? (month.cost / elapsed) * dim : null;
    const paceText = pace ? ` · on pace for ${money(pace)}` : '';

    if (plan.id === 'api') {
      $('valueTitle').textContent = 'This month (pay as you go)';
      $('multiple').textContent = money(month.cost);
      $('valueText').textContent = `roughly your real bill${paceText}`;
      $('meter').hidden = true;
      return;
    }
    $('meter').hidden = false;
    $('valueTitle').textContent = `This month vs ${plan.label}`;
    if (!plan.monthly) {
      $('multiple').textContent = money(month.cost);
      $('valueText').textContent = 'in tokens. Pick your plan to compare.';
      $('meterFill').style.width = '0';
      return;
    }
    const x = month.cost / plan.monthly;
    $('multiple').textContent = x >= 10 ? Math.round(x) + '×' : x.toFixed(1) + '×';
    $('valueText').textContent = `${money(month.cost)} of tokens for $${plan.monthly}${paceText}`;
    const max = Math.max(plan.monthly, month.cost);
    $('meterFill').style.width = (month.cost / max) * 100 + '%';
    $('meter').style.setProperty('--one', `calc(${(plan.monthly / max) * 100}% - 2px)`);
  }

  function renderLifetime() {
    const cov = data.coverage || {};
    const est = data.estimate || { total: 0, gapDays: 0, avgPerDay: 0 };
    const bySource = { log: 0, stats: 0, session: 0 };
    for (const r of data.rows) bySource[r.source] = (bySource[r.source] || 0) + r.cost;
    const tracked = bySource.log + bySource.stats + bySource.session;
    const on = estimateOn();

    $('lifeSince').textContent = cov.start ? 'since ' + niceDate(cov.start, true) : '';
    $('lifeTotal').innerHTML = on ? '≈ ' + money(tracked + est.total) : money(tracked);
    $('lifeText').textContent = on
      ? `${money(tracked)} tracked + ~${money(est.total)} estimated`
      : est.total > 0 ? `tracked · ~${money(est.total)} more is hiding in the gaps` : 'tracked';

    // coverage strip
    const segs = cov.segments || [];
    const span = (s) => Math.round((fromKey(s.to) - fromKey(s.from)) / 86400000) + 1;
    const KIND = { exact: 'Exact logs', recovered: 'Recovered from /stats', none: 'No data' };
    $('coverage').innerHTML = segs.map((s) =>
      `<i class="seg ${s.kind}" style="flex-grow:${span(s)}" title="${niceDate(s.from)} – ${niceDate(s.to)} · ${KIND[s.kind]}"></i>`).join('');
    $('covStart').textContent = cov.start ? niceDate(cov.start, true) : '';

    const legend = [];
    if (bySource.log) legend.push(['exact', 'Exact logs', `${money(bySource.log)}${cov.exactFrom ? ' · since ' + niceDate(cov.exactFrom) : ''}`]);
    if (bySource.stats || bySource.session) {
      const bits = [];
      if (bySource.stats) bits.push(`/stats cache ${niceDate(cov.statsFrom)}–${niceDate(cov.statsTo)}`);
      if (cov.recoveredSessions) bits.push(plural(cov.recoveredSessions, 'old session'));
      legend.push(['recovered', 'Recovered', `${money(bySource.stats + bySource.session)} · ${bits.join(' + ')}`]);
    }
    if (est.gapDays) legend.push(['none', 'No data', `${plural(est.gapDays, 'day')} · ~${money(est.total)} est.`]);
    $('lifeLegend').innerHTML = legend.map(([k, name, val]) =>
      `<li><i class="sw ${k}"></i><span>${name}</span><span class="lv">${esc(val)}</span></li>`).join('');

    const plan = currentPlan();
    const since = data.account && data.account.subscribedSince;
    if (since && plan.monthly) {
      const s = new Date(since), n = new Date();
      const months = Math.max(1, (n.getFullYear() - s.getFullYear()) * 12 + n.getMonth() - s.getMonth() + (n.getDate() >= s.getDate() ? 1 : 0));
      const paid = months * plan.monthly;
      const worth = tracked + (on ? est.total : 0);
      $('lifePaid').hidden = false;
      $('lifePaid').innerHTML = `You've paid about <b>${money(paid)}</b> since ${s.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' })} `
        + `(${months} × $${plan.monthly}), so that's <b>${(worth / paid).toFixed(1)}×</b> your money${on ? '' : ' on tracked usage alone'}.`;
    } else {
      $('lifePaid').hidden = true;
    }

    $('includeEstimate').checked = includeEst;
    $('includeEstimate').closest('.switch').hidden = !est.gapDays;
    $('lifeNote').textContent = est.gapDays
      ? `Claude Code deleted the logs for ${plural(est.gapDays, 'day')}. The estimate assumes those days averaged ${money(est.avgPerDay)}, like the days we do know about, minus the old sessions we recovered. It's a ballpark, not a receipt.`
      : 'Every day since you started is covered. Nice.';
  }

  function renderBlock() {
    const b = data.last5h;
    $('blockCost').textContent = money(b.cost);
    $('blockTokens').textContent = tokens(b.tokens);
    if (b.first) {
      const hrs = Math.max((Date.now() - b.first) / 3600000, 0.25);
      $('blockRate').textContent = money(b.cost / hrs);
      $('blockSince').textContent = 'since ' + new Date(b.first).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
    } else {
      $('blockRate').textContent = '$0.00';
      $('blockSince').textContent = 'quiet';
    }
  }

  // ---------- chart ----------
  function chartBuckets() {
    if (range === 'all') {
      const byMonth = new Map();
      for (const r of data.rows) {
        const m = r.day.slice(0, 7);
        const v = byMonth.get(m) || { cost: 0, tokens: 0 };
        v.cost += r.cost; v.tokens += r.input + r.output + r.cw + r.cr;
        byMonth.set(m, v);
      }
      const start = (data.coverage && data.coverage.start) || dayKey(new Date());
      const out = [];
      const d = new Date(start.slice(0, 7) + '-01T12:00:00');
      const end = dayKey(new Date()).slice(0, 7);
      while (dayKey(d).slice(0, 7) <= end) {
        const key = dayKey(d).slice(0, 7);
        out.push({
          key, inRange: true, ...(byMonth.get(key) || { cost: 0, tokens: 0 }),
          est: estimateOn() ? (data.estimate.byMonth[key] || 0) : 0,
          label: d.toLocaleDateString(LOCALE, { month: 'short' }),
          long: d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }),
        });
        d.setMonth(d.getMonth() + 1);
      }
      return { buckets: out, title: 'Monthly spend', sub: 'since you started' };
    }
    const byDay = new Map();
    for (const r of data.rows) {
      const v = byDay.get(r.day) || { cost: 0, tokens: 0 };
      v.cost += r.cost; v.tokens += r.input + r.output + r.cw + r.cr;
      byDay.set(r.day, v);
    }
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i), key = dayKey(d);
      out.push({
        key, inRange: inRange(key, range), est: 0, ...(byDay.get(key) || { cost: 0, tokens: 0 }),
        label: i === 0 ? 'Today' : d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }),
        long: d.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
    return { buckets: out, title: 'Daily spend', sub: 'last 30 days' };
  }

  function renderChart() {
    const el = $('chart');
    const { buckets, title, sub } = chartBuckets();
    $('chartTitle').textContent = title;
    $('chartRange').textContent = sub;
    const hasEst = buckets.some((b) => b.est > 0);
    $('chartLegend').hidden = !hasEst;

    const W = el.clientWidth || 400, H = el.clientHeight || 120;
    const maxV = Math.max(...buckets.map((b) => b.cost + b.est), 1);
    const step = niceStep(maxV);
    const top = Math.ceil(maxV / step) * step;
    const padL = 38, padB = 18, padT = 6;
    const plotW = W - padL, plotH = H - padB - padT;
    const slot = plotW / buckets.length;
    const bw = Math.max(2, Math.min(slot - 2, 28));
    const y = (v) => padT + plotH - (v / top) * plotH;
    const r = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-radius'));
    const radius = Number.isNaN(r) ? 4 : r;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">`;
    for (let g = step; g <= top + 1e-9; g += step) {
      svg += `<line class="grid" x1="${padL}" x2="${W}" y1="${y(g)}" y2="${y(g)}"/>`;
      svg += `<text x="${padL - 6}" y="${y(g) + 3}" text-anchor="end">${axisMoney(g)}</text>`;
    }
    svg += `<line class="axis" x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`;
    buckets.forEach((b, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const h = Math.max(0, y(0) - y(b.cost));
      svg += `<rect class="hit" data-i="${i}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}"/>`;
      svg += `<path class="bar${b.inRange ? '' : ' dim'}" data-i="${i}" d="${barPath(x, y(0), bw, h, Math.min(radius, bw / 2))}"/>`;
      if (b.est > 0) {
        const eh = y(b.cost) - y(b.cost + b.est);
        // 2px gap between tracked and estimated
        if (eh > 3) svg += `<rect class="est" x="${x + 0.75}" y="${y(b.cost + b.est) + 0.75}" width="${bw - 1.5}" height="${eh - 2 - 1.5}" rx="${Math.min(3, radius)}"/>`;
      }
    });
    const labelIdx = buckets.length <= 12 ? buckets.map((_, i) => i) : [0, Math.floor(buckets.length / 2), buckets.length - 1];
    labelIdx.forEach((i) => {
      const many = buckets.length > 12;
      const last = i === buckets.length - 1, first = i === 0 && many;
      const x = first ? padL : last && many ? W : padL + i * slot + slot / 2;
      svg += `<text x="${x}" y="${H - 4}" text-anchor="${first ? 'start' : last && many ? 'end' : 'middle'}">${buckets[i].label}</text>`;
    });
    el.innerHTML = svg + '</svg>';

    const tip = $('tooltip');
    el.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('pointerenter', () => {
        const i = +hit.dataset.i, b = buckets[i];
        el.querySelector(`.bar[data-i="${i}"]`).classList.add('hover');
        const rect = hit.getBoundingClientRect();
        tip.innerHTML = `<b>${b.long}</b> · ${money(b.cost)}${b.est ? ` + ~${money(b.est)} est.` : ''} · ${tokens(b.tokens)} tok`;
        tip.hidden = false;
        tip.style.left = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110) + 'px';
        tip.style.top = (el.getBoundingClientRect().top + y(b.cost + b.est)) + 'px';
      });
      hit.addEventListener('pointerleave', () => {
        el.querySelector(`.bar[data-i="${hit.dataset.i}"]`).classList.remove('hover');
        tip.hidden = true;
      });
    });
  }

  function niceStep(max) {
    const raw = max / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  }
  const axisMoney = (v) => (v >= 1000 ? '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : '$' + (v < 1 ? v.toFixed(2) : Math.round(v)));

  // bar with rounded top corners, flat on the baseline
  function barPath(x, base, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, h);
    const t = base - h;
    return `M${x},${base}V${t + r}Q${x},${t} ${x + r},${t}H${x + w - r}Q${x + w},${t} ${x + w},${t + r}V${base}Z`;
  }

  // ---------- lists ----------
  function renderHighlights(rows) {
    $('hlRange').textContent = RANGE_LABEL[range];
    const days = groupBy(rows, 'day').filter((d) => d.cost > 0);
    const top = days[0];
    const total = days.reduce((a, d) => a + d.cost, 0);
    // what cache reads would have cost as fresh input, minus the cache-write premium
    let saved = 0;
    for (const r of rows) {
      const p = data.pricing[r.model];
      if (!p) continue;
      saved += (r.cr * (p.input - p.cacheRead) - r.cw * p.input * 0.25) / 1e6;
    }
    const tiles = [
      ['Priciest day', top ? money(top.cost) : '—', top ? niceDate(top.key) : 'nothing yet'],
      ['Per active day', days.length ? money(total / days.length) : '—', 'on average'],
      ['Active days', String(days.length), range === 'all' ? 'with data' : 'in this range'],
      ['Caching saved', saved > 0 ? money(saved) : '—', 'vs. no prompt cache'],
    ];
    $('highlights').innerHTML = tiles.map(([k, v, s]) =>
      `<div><span class="k">${k}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join('');
  }

  function renderModels(rows, total) {
    const models = groupBy(rows, 'model');
    $('modelsRange').textContent = RANGE_LABEL[range];
    if (!models.length) {
      $('models').innerHTML = `<li class="muted small" style="display:block">Nothing ${RANGE_LABEL[range]} yet.</li>`;
      return;
    }
    $('models').innerHTML = models.map((m) => {
      const recoveredOnly = m.rows.every((r) => r.source !== 'log');
      const pct = total.cost ? (m.cost / total.cost) * 100 : 0;
      return `
      <li data-model="${esc(m.key)}" title="Make ${esc(modelName(m.key))} jump">
        <span class="mini">${Sprites.svg(m.key, Sprites.look(m.key).scale < 1 ? 1.25 : 1.5, { tight: true, samurai: theme.samurai })}</span>
        <div>
          <div class="mname">${esc(modelName(m.key))}${recoveredOnly ? ' <span class="pill">recovered</span>' : ''}</div>
          <div class="mmeta">${tokens(m.tokens)} tok${m.n ? ' · ' + plural(m.n, 'msg') : ''} · ${Math.round(pct)}%</div>
          <div class="share"><i style="width:${pct}%"></i></div>
        </div>
        <span class="cost">${money(m.cost)}</span>
      </li>`;
    }).join('');
  }

  function renderKinds(t) {
    const kinds = [
      ['Output', "Claude's replies & tool calls", t.output, t.costOutput],
      ['Cache reads', 're-reading your context', t.cr, t.costCr],
      ['Cache writes', 'storing context for reuse', t.cw, t.costCw],
      ['Input', 'fresh, uncached prompt', t.input, t.costInput],
    ].sort((a, b) => b[3] - a[3]);
    $('kinds').innerHTML = kinds.map(([name, hint, tok, cost]) => `
      <li><span class="kname">${name}<small>${hint}</small></span><span class="tok">${tokens(tok)}</span><span class="cost">${money(cost)}</span></li>`).join('');
  }

  function renderProjects(rows) {
    const ps = groupBy(rows, 'project').slice(0, 6);
    $('projects').innerHTML = ps.length
      ? ps.map((p) => `<li><span class="pname" title="${esc(p.key)}">${esc(p.key)}</span><span class="cost">${money(p.cost)}</span></li>`).join('')
      : `<li class="muted small" style="display:block">No projects ${RANGE_LABEL[range]}.</li>`;
  }

  function renderFoot() {
    if (!data) return;
    const ago = Math.round((Date.now() - lastFetch) / 1000);
    const when = ago < 5 ? 'just now' : ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
    $('footText').textContent = `${plural(data.messages, 'msg')} · ${plural(data.files, 'log')} · updated ${when}`;
  }

  function renderAccount() {
    const a = data.account || {};
    const plan = currentPlan();
    $('demoBadge').hidden = !data.demo;
    $('whoText').innerHTML = a.loggedIn
      ? `<span class="who-name">${esc(a.name || 'You')} · </span><b>${esc(plan.label)}</b>`
      : `Not logged in · <b>${esc(plan.label)}</b>`;
    $('who').title = a.loggedIn ? 'Logged in to Claude Code' : 'Log in with `claude` to see your account here';
  }

  function exportCsv() {
    const head = ['day', 'model', 'project', 'source', 'messages', 'input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens', 'cost_usd'];
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const lines = rowsIn(range).sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => [r.day, r.model, r.project, r.source, r.n, r.input, r.output, r.cw, r.cr, r.cost.toFixed(4)].map(q).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clawdycalc-${range}-${dayKey(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- data ----------
  async function load() {
    try {
      const res = await fetch('/api/usage' + (DEMO ? '?demo=1' : ''), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const body = await res.text();
      lastFetch = Date.now();
      $('live').className = 'live on';
      // nothing new since the last poll: leave the page alone so hovers and animations aren't reset
      const same = body.replace(/"generatedAt":\d+,?/, '');
      if (same === lastBody) { renderFoot(); return; }
      lastBody = same;
      data = JSON.parse(body);
      renderAccount();
      render();
      syncMascots();
    } catch (e) {
      $('live').className = 'live err';
      $('whoText').textContent = 'Server offline';
    }
  }

  function syncMascots() {
    const byModel = groupBy(data.rows, 'model');
    const total = byModel.reduce((s, m) => s + m.cost, 0) || 1;
    stage.sync(byModel.slice(0, 6).map((m) => ({ id: m.key, name: modelName(m.key), share: m.cost / total })));

    const now = new Map(byModel.map((m) => [m.key, m.cost]));
    if (prevModelCost && !data.demo) {
      for (const [id, cost] of now) {
        const delta = cost - (prevModelCost.get(id) || 0);
        if (delta >= 0.005) stage.celebrate(id, '+' + money(delta));
      }
    }
    prevModelCost = now;
  }

  const stage = createStage($('stage'), {
    label(id, talking) {
      if (!talking || !data) return modelName(id);
      const cost = data.rows.filter((r) => r.model === id && inRange(r.day, range)).reduce((s, r) => s + r.cost, 0);
      return `${money(cost)} ${range === 'all' ? 'all time' : range === 'month' ? 'this month' : range}`;
    },
    aria(id) {
      if (!data) return modelName(id);
      const cost = data.rows.filter((r) => r.model === id && inRange(r.day, range)).reduce((s, r) => s + r.cost, 0);
      return `${modelName(id)}: ${money(cost)} ${RANGE_LABEL[range]}. Press Enter to make it jump.`;
    },
  });

  // ---------- themes ----------
  function setTheme(id) {
    theme = Themes.apply(id, (t) => {
      stage.setVariant({ samurai: t.samurai });
      if (window.ClawdyDesktop) window.ClawdyDesktop.background(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
      if (data) render();
    });
    bigCounter.replay(); // show off the new theme's count-up
    store.set('cc.theme', theme.id);
    const pop = $('themePop');
    if (!pop.hidden) Themes.buildPicker(pop, theme.id, setTheme);
  }

  function toggleThemePicker(open) {
    const pop = $('themePop');
    open = open ?? pop.hidden;
    pop.hidden = !open;
    $('themeBtn').setAttribute('aria-expanded', String(open));
    if (open) {
      Themes.buildPicker(pop, theme.id, setTheme);
      const current = pop.querySelector('[aria-checked="true"]');
      if (current) current.focus();
    }
  }

  function cycleTheme(step) {
    const list = Themes.list;
    const i = list.findIndex((t) => t.id === theme.id);
    setTheme(list[(i + step + list.length) % list.length].id);
  }

  setTheme(theme.id);

  $('themeBtn').addEventListener('click', () => toggleThemePicker());
  document.addEventListener('click', (e) => {
    if (!$('themePop').hidden && !e.target.closest('.top-right')) toggleThemePicker(false);
  });

  // keyboard: T / Shift+T cycles themes, 1–5 picks a range, Esc closes the picker
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'Escape' && !$('themePop').hidden) { toggleThemePicker(false); $('themeBtn').focus(); return; }
    if (e.key === 't' || e.key === 'T') { cycleTheme(e.shiftKey ? -1 : 1); return; }
    if (e.key === 'r' || e.key === 'R') { load(); return; }
    const ranges = ['today', '7d', '30d', 'month', 'all'];
    const n = Number(e.key);
    if (n >= 1 && n <= 5) { range = ranges[n - 1]; store.set('cc.range', range); render(); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !$('themePop').hidden) {
      e.preventDefault();
      const items = [...$('themePop').querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });

  // ---------- events ----------
  $('ranges').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    range = b.dataset.range;
    store.set('cc.range', range);
    render();
  });

  $('planSelect').value = store.get('cc.plan', 'auto');
  $('planSelect').addEventListener('change', (e) => {
    store.set('cc.plan', e.target.value);
    if (data) { renderAccount(); render(); }
  });

  $('includeEstimate').addEventListener('change', (e) => {
    includeEst = e.target.checked;
    store.set('cc.est', includeEst ? '1' : '0');
    render();
  });

  $('keepLogs').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/keep-logs', { method: 'POST', headers: { 'X-ClawdyCalc': '1' } });
      if (!res.ok) throw new Error(res.status);
      data.retention = await res.json();
      $('retention').innerHTML = '<div><h2>Done!</h2><p>Claude Code will keep your logs from now on. Your old settings were backed up next to settings.json.</p></div>';
      setTimeout(() => { $('retention').hidden = true; }, 5000);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Try again';
    }
  });

  $('models').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-model]');
    if (!li) return;
    const st = $('stage');
    if (st.getBoundingClientRect().bottom < 0) st.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    stage.poke(li.dataset.model);
  });

  $('exportCsv').addEventListener('click', () => data && exportCsv());

  $('dismissRetention').addEventListener('click', () => {
    store.set('cc.retentionSnooze', String(Date.now() + 7 * 86400000));
    $('retention').hidden = true;
  });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => data && renderChart(), 120); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFetch > 5000) load(); });
  // In the desktop app a hidden window still refreshes now and then, so the tray tooltip stays current.
  setInterval(() => {
    if (!document.hidden || (window.ClawdyDesktop && Date.now() - lastFetch > HIDDEN_POLL_MS)) load();
  }, POLL_MS);
  setInterval(renderFoot, 5000);
  load();
})();
