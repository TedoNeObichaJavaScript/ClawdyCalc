// Source 1: Claude Code session logs (~/.claude/projects/**/*.jsonl).
// Exact, per-message usage. Claude Code deletes these after `cleanupPeriodDays` (30 by default).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { normalizeModel } = require('../pricing');
const { projectName } = require('../util');

// path -> { size, mtimeMs, offset, messages: Map<id, record> }
const fileCache = new Map();

async function walk(dir, out = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function readFrom(file, start) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    fs.createReadStream(file, { start })
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

function parseLine(line) {
  if (!line.includes('"usage"')) return null;
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  const msg = row.message;
  if (!msg || !msg.usage || !msg.model || msg.model === '<synthetic>') return null;
  const u = msg.usage;
  const cc = u.cache_creation || {};
  const cacheTotal = u.cache_creation_input_tokens || 0;
  const cw1h = cc.ephemeral_1h_input_tokens || 0;
  const cw5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, cacheTotal - cw1h);
  return {
    // Claude Code writes one line per content block, all sharing the message id.
    id: (msg.id || '') + '|' + (row.requestId || ''),
    rec: {
      model: normalizeModel(msg.model),
      ts: Date.parse(row.timestamp) || 0,
      project: projectName(row.cwd),
      session: row.sessionId || '',
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cw5m,
      cw1h,
      cr: u.cache_read_input_tokens || 0,
      speed: u.speed === 'fast' ? 'fast' : undefined,
    },
  };
}

function mergeInto(map, id, rec) {
  const prev = map.get(id);
  if (!prev) { map.set(id, rec); return; }
  for (const k of ['input', 'output', 'cw5m', 'cw1h', 'cr']) prev[k] = Math.max(prev[k], rec[k]);
  if (rec.ts && (!prev.ts || rec.ts < prev.ts)) prev.ts = rec.ts;
}

async function scanFile(file) {
  let st;
  try { st = await fsp.stat(file); } catch { fileCache.delete(file); return; }
  let entry = fileCache.get(file);
  if (entry && entry.size === st.size && entry.mtimeMs === st.mtimeMs) return;
  if (!entry || st.size < entry.offset) {
    entry = { size: 0, mtimeMs: 0, offset: 0, messages: new Map() };
    fileCache.set(file, entry);
  }
  const buf = await readFrom(file, entry.offset);
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl >= 0) {
    for (const line of buf.subarray(0, lastNl).toString('utf8').split('\n')) {
      const p = parseLine(line);
      if (p) mergeInto(entry.messages, p.id, p.rec);
    }
    entry.offset += lastNl + 1; // keep a half-written last line for the next scan
  }
  entry.size = st.size;
  entry.mtimeMs = st.mtimeMs;
}

let scanning = null;
function scanLogs(dirs) {
  if (scanning) return scanning;
  scanning = (async () => {
    const files = (await Promise.all(dirs.map((d) => walk(d)))).flat();
    const seen = new Set(files);
    for (const f of fileCache.keys()) if (!seen.has(f)) fileCache.delete(f);
    const queue = files.slice();
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (queue.length) await scanFile(queue.shift());
    }));
    // Dedupe across files too: resumed sessions can copy history into a new file.
    const messages = new Map();
    const sessions = new Set();
    for (const [file, entry] of fileCache) {
      sessions.add(path.basename(file, '.jsonl'));
      for (const [id, rec] of entry.messages) mergeInto(messages, id, { ...rec });
    }
    return { messages, sessions, files: fileCache.size };
  })().finally(() => { scanning = null; });
  return scanning;
}

module.exports = { scanLogs, mergeInto };
