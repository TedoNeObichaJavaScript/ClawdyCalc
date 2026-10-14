// ClawdyCalc local server. No dependencies, listens on 127.0.0.1 only.
const http = require('http');
const fsp = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');

const paths = require('./paths');
const { PRICING } = require('./pricing');
const { scanLogs } = require('./sources/logs');
const { readStatsCache } = require('./sources/stats-cache');
const { readLastSessions } = require('./sources/last-sessions');
const { Ledger } = require('./ledger');
const { buildReport } = require('./report');
const { readAccount } = require('./account');
const { getRetention, keepLogsForever } = require('./settings');
const { demoReport } = require('./demo');

const ARCHIVE_EVERY_MS = 5 * 60 * 1000;
const ledger = new Ledger(paths.DATA_DIR);

// Read every source, archive what's new, return everything we know.
async function collect() {
  const [{ messages: live, sessions, files }, stats, lastSessions] = await Promise.all([
    scanLogs(paths.PROJECTS_DIRS),
    readStatsCache(paths.STATS_CACHE),
    readLastSessions(paths.CLAUDE_JSON),
  ]);
  await ledger.addMessages(live);
  await ledger.addRecovered([...stats, ...lastSessions]);
  const knownSessions = new Set(sessions);
  for (const rec of ledger.messages.values()) if (rec.session) knownSessions.add(rec.session);
  return { messages: ledger.messages, knownSessions, recovered: Object.values(ledger.recovered), files };
}

async function usage() {
  const [data, account, retention] = await Promise.all([collect(), readAccount(), getRetention()]);
  const report = buildReport({ ...data, firstUse: account.firstUse });
  return { ...report, files: data.files, account, retention, pricing: PRICING };
}

// ---------- http ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

// getPort() because the real port is only known after listen() (the desktop app may ask for port 0)
function handler(getPort) {
  return async (req, res) => {
    const port = getPort();
    const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
    // Blocks DNS-rebinding: only answer requests addressed to us by name.
    if (!allowedHosts.has(req.headers.host)) return send(res, 403, 'forbidden', 'text/plain');
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === '/api/usage' && req.method === 'GET') {
        const body = url.searchParams.has('demo') ? { ...demoReport(), pricing: PRICING } : await usage();
        return send(res, 200, JSON.stringify(body));
      }
      if (url.pathname === '/api/keep-logs' && req.method === 'POST') {
        // Same-origin only. The custom header can't be sent cross-site without a CORS preflight we never approve.
        const origin = req.headers.origin;
        if (req.headers['x-clawdycalc'] !== '1' || (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, '')))) {
          return send(res, 403, JSON.stringify({ error: 'forbidden' }));
        }
        return send(res, 200, JSON.stringify(await keepLogsForever()));
      }
      if (req.method !== 'GET') return send(res, 405, 'method not allowed', 'text/plain');
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.join(paths.PUBLIC_DIR, rel);
      if (!file.startsWith(paths.PUBLIC_DIR + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
      send(res, 200, await fsp.readFile(file), MIME[path.extname(file)] || 'application/octet-stream');
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, 'not found', 'text/plain');
      console.error(err);
      send(res, 500, JSON.stringify({ error: String(err.message || err) }));
    }
  };
}

function openWindow(url) {
  if (process.platform === 'win32') {
    // Edge "app mode" gives a small window with no browser chrome.
    exec(`start "" msedge --app=${url} --window-size=500,900`, (err) => { if (err) exec(`start "" ${url}`); });
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

let loaded = false;
let archiveTimer = null;

// Options:
//   port        4317 by default; 0 picks any free port
//   open        open a browser window once ready
//   exitIfBusy  CLI behavior: if the port is taken, open the running copy and exit.
//               The desktop app passes false and gets the EADDRINUSE error instead.
//   log         where to print status lines
async function start({ port = 4317, open = true, exitIfBusy = true, log = console.log } = {}) {
  if (!loaded) { await ledger.load(); loaded = true; }
  let actualPort = port;
  const server = http.createServer(handler(() => actualPort));

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (err) {
    if (err.code === 'EADDRINUSE' && exitIfBusy) {
      log(`Port ${port} is busy, so ClawdyCalc is probably already running. Opening it.`);
      if (open) openWindow(`http://localhost:${port}`);
      setTimeout(() => process.exit(0), 500);
      return null;
    }
    throw err;
  }

  actualPort = server.address().port;
  const url = `http://localhost:${actualPort}`;
  log(`ClawdyCalc is running at ${url}`);
  log(`Reading Claude Code logs from ${paths.PROJECTS_DIRS.join(', ') || '(none found)'}`);
  log(`Archiving to ${paths.DATA_DIR}`);
  const t = Date.now();
  const { files } = await collect();
  log(`Indexed ${files} log files in ${Date.now() - t}ms. ${ledger.messages.size} messages archived.`);
  if (open) openWindow(url);
  // Keep archiving in the background so history is saved even with the window closed.
  if (!archiveTimer) {
    archiveTimer = setInterval(() => collect().catch((e) => log('archive failed: ' + e.message)), ARCHIVE_EVERY_MS);
    archiveTimer.unref();
  }
  return { server, port: actualPort, url };
}

module.exports = { start };
