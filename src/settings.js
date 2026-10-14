// Claude Code's log retention (`cleanupPeriodDays` in ~/.claude/settings.json).
const fsp = require('fs/promises');
const { SETTINGS } = require('./paths');
const { readJson } = require('./util');

const DEFAULT_DAYS = 30;
const FOREVER_DAYS = 36500;

async function getRetention() {
  const s = await readJson(SETTINGS);
  const days = s && Number(s.cleanupPeriodDays) > 0 ? Number(s.cleanupPeriodDays) : DEFAULT_DAYS;
  return { days, forever: days >= 3650 };
}

// Only ever called when the user clicks "Keep logs forever" in the page.
async function keepLogsForever() {
  let raw = null;
  try { raw = await fsp.readFile(SETTINGS, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const s = raw ? JSON.parse(raw) : {};
  if (raw) await fsp.writeFile(SETTINGS + '.clawdycalc-backup', raw);
  s.cleanupPeriodDays = FOREVER_DAYS;
  await fsp.writeFile(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  return getRetention();
}

module.exports = { getRetention, keepLogsForever };
