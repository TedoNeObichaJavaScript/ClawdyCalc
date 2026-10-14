// ClawdyCalc's own archive, so history survives Claude Code's log cleanup.
//   ~/.clawdycalc/messages.jsonl  one compact line per message (append-only, later lines win)
//   ~/.clawdycalc/recovered.json  rows recovered from the /stats cache and ~/.claude.json
const fsp = require('fs/promises');
const path = require('path');
const { mergeInto } = require('./sources/logs');

const FIELDS = ['input', 'output', 'cw5m', 'cw1h', 'cr'];

class Ledger {
  constructor(dir) {
    this.dir = dir;
    this.msgFile = path.join(dir, 'messages.jsonl');
    this.recFile = path.join(dir, 'recovered.json');
    this.messages = new Map();
    this.recovered = {};
    this.lines = 0;
  }

  async load() {
    await fsp.mkdir(this.dir, { recursive: true });
    try {
      const text = await fsp.readFile(this.msgFile, 'utf8');
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          const c = JSON.parse(line);
          mergeInto(this.messages, c.id, {
            model: c.m, ts: c.t, project: c.p, session: c.sid || '',
            input: c.i || 0, output: c.o || 0, cw5m: c.w5 || 0, cw1h: c.w1 || 0, cr: c.r || 0,
            speed: c.s,
          });
          this.lines++;
        } catch { /* skip a torn line */ }
      }
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { this.recovered = JSON.parse(await fsp.readFile(this.recFile, 'utf8')); } catch { this.recovered = {}; }
    if (this.lines > this.messages.size * 1.5 + 200) await this.compact();
  }

  // Remember new messages (or ones that grew while streaming). Returns how many changed.
  async addMessages(live) {
    const out = [];
    for (const [id, rec] of live) {
      const prev = this.messages.get(id);
      if (prev && FIELDS.every((k) => prev[k] >= rec[k])) continue;
      mergeInto(this.messages, id, { ...rec });
      out.push(encode(id, this.messages.get(id)));
    }
    if (out.length) {
      await fsp.appendFile(this.msgFile, out.join('\n') + '\n');
      this.lines += out.length;
    }
    return out.length;
  }

  // Keep recovered rows we've seen before even after their source forgets them.
  async addRecovered(rows) {
    let changed = false;
    for (const r of rows) {
      const prev = this.recovered[r.key];
      if (!prev || FIELDS.some((k) => r[k] > prev[k])) { this.recovered[r.key] = r; changed = true; }
    }
    if (changed) await writeAtomic(this.recFile, JSON.stringify(this.recovered));
  }

  async compact() {
    const lines = [...this.messages].map(([id, rec]) => encode(id, rec));
    await writeAtomic(this.msgFile, lines.join('\n') + (lines.length ? '\n' : ''));
    this.lines = lines.length;
  }
}

function encode(id, r) {
  const c = { id, m: r.model, t: r.ts, p: r.project, sid: r.session || undefined,
    i: r.input, o: r.output, w5: r.cw5m || undefined, w1: r.cw1h || undefined, r: r.cr, s: r.speed };
  return JSON.stringify(c);
}

async function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

module.exports = { Ledger };
