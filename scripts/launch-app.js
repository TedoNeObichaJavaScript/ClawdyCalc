#!/usr/bin/env node
// Starts the desktop app in development (`npm run app`).
// Clears ELECTRON_RUN_AS_NODE first: terminals inside VS Code set it, and it makes Electron
// silently run as plain Node instead of opening a window.
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron'); // in plain Node this is the path to the Electron binary

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, '..'), ...process.argv.slice(2)], { env, stdio: 'inherit', detached: true });
child.unref();
