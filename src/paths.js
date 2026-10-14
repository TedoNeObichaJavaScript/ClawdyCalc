// Where Claude Code keeps its files, and where ClawdyCalc keeps its archive.
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');

// Newer Claude Code versions can also use ~/.config/claude
const PROJECTS_DIRS = [...new Set([
  path.join(CLAUDE_DIR, 'projects'),
  path.join(HOME, '.config', 'claude', 'projects'),
])].filter((d) => fs.existsSync(d));

module.exports = {
  HOME,
  CLAUDE_DIR,
  PROJECTS_DIRS,
  CLAUDE_JSON: process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
    : path.join(HOME, '.claude.json'),
  STATS_CACHE: path.join(CLAUDE_DIR, 'stats-cache.json'),
  SETTINGS: path.join(CLAUDE_DIR, 'settings.json'),
  DATA_DIR: process.env.CLAWDYCALC_HOME || path.join(HOME, '.clawdycalc'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
};
