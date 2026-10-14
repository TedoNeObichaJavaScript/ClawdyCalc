#!/usr/bin/env node
// Usage: clawdycalc [--port 4317] [--no-open]
const { start } = require('../src/server');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('clawdycalc [--port <n>] [--no-open]\n\nShows your Claude Code usage priced at API rates, at http://localhost:4317');
  process.exit(0);
}
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT) || 4317;

start({ port, open: !args.includes('--no-open') });
