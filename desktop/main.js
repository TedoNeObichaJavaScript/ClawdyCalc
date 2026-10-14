// ClawdyCalc desktop app (Electron).
// Runs the same local server in-process and shows it in a frameless window with a
// pin-on-top button, a compact widget mode and a tray icon. Closing hides to the tray so
// ClawdyCalc keeps archiving your usage in the background.
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, screen, Notification } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ICON = path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const HOTKEY = 'CommandOrControl+Alt+Shift+C';
const STARTED_HIDDEN = process.argv.includes('--hidden'); // set when launched at login
const DEFAULTS = { width: 460, height: 860, compactHeight: 330, pinned: false, compact: false, opacity: 1, trayHintShown: false, background: '#F3F0E8' };

let win = null;
let tray = null;
let serverUrl = null;
let quitting = false;
let state = null;
let summary = '';
let lastBlur = 0;

app.setAppUserModelId('com.tedoneobicha.clawdycalc'); // groups the taskbar icon so it can be pinned

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
  app.whenReady().then(boot);
}

// ---------- saved window state ----------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}

let saveTimer;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2)); } catch { /* not worth crashing over */ }
  }, 300);
}

// put the window back where it was, unless that spot is now off-screen
function initialBounds() {
  const width = state.width;
  const height = state.compact ? state.compactHeight : state.height;
  if (state.x == null || state.y == null) return { width, height };
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    state.x + 80 > a.x && state.x < a.x + a.width - 80 && state.y >= a.y - 10 && state.y < a.y + a.height - 40);
  return visible ? { x: state.x, y: state.y, width, height } : { width, height };
}

// ---------- server ----------

// Reuse ClawdyCalc's web server if it's already running on 4317 (so only one process
// writes the archive), otherwise run our own.
async function startServer() {
  const { start } = require('../src/server');
  const quiet = () => {};
  try {
    return (await start({ port: 4317, open: false, exitIfBusy: false, log: quiet })).url;
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    if (await isClawdyCalc(4317)) return 'http://localhost:4317';
    return (await start({ port: 0, open: false, exitIfBusy: false, log: quiet })).url;
  }
}

function isClawdyCalc(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/usage?demo=1', headers: { host: `localhost:${port}` }, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(Array.isArray(JSON.parse(body).rows)); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---------- window ----------

function publicState() {
  return {
    pinned: state.pinned,
    compact: state.compact,
    opacity: state.opacity,
    autoStart: app.getLoginItemSettings(loginItem()).openAtLogin,
    hotkey: HOTKEY.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl'),
  };
}

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('win:state', publicState());
  if (tray) tray.setContextMenu(trayMenu());
}

function createWindow() {
  win = new BrowserWindow({
    ...initialBounds(),
    minWidth: 380,
    minHeight: 220,
    frame: false,
    show: false,
    title: 'ClawdyCalc',
    icon: ICON,
    backgroundColor: state.background, // last theme's color, so a dark theme doesn't flash light on start
    maximizable: false, // double-clicking the drag bar would otherwise maximize the little widget
    fullscreenable: false,
    alwaysOnTop: state.pinned,
    opacity: state.opacity,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (state.pinned) win.setAlwaysOnTop(true, 'floating');
  win.loadURL(serverUrl);
  win.once('ready-to-show', () => { if (!STARTED_HIDDEN) win.show(); });

  // links in the page (credits, docs) open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOurs(url)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  const remember = () => {
    if (win.isMinimized() || win.isMaximized()) return;
    const b = win.getBounds();
    Object.assign(state, { x: b.x, y: b.y, width: b.width });
    if (state.compact) state.compactHeight = b.height; else state.height = b.height;
    saveState();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('show', broadcast); // keeps the tray's Show/Hide label right
  win.on('hide', broadcast);
  win.on('blur', () => { lastBlur = Date.now(); });

  // closing hides to the tray, so archiving keeps going; Quit lives in the tray menu
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!state.trayHintShown && Notification.isSupported()) {
      new Notification({ title: 'ClawdyCalc is still running', body: 'It keeps saving your usage from the tray. Right-click the tray icon to quit.', icon: ICON }).show();
      state.trayHintShown = true;
      saveState();
    }
  });
}

function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Clicking the tray icon takes focus from the window first, so "was focused a moment ago" counts too.
function toggle() {
  if (win.isVisible() && (win.isFocused() || Date.now() - lastBlur < 300)) win.hide(); else show();
}

function setPinned(on) {
  state.pinned = !!on;
  win.setAlwaysOnTop(state.pinned, 'floating');
  saveState();
  broadcast();
}

// The page works out how tall the compact widget should be and passes it in.
function setCompact(on, height) {
  const b = win.getBounds();
  if (on && !state.compact) state.height = b.height;
  state.compact = !!on;
  const h = on ? Math.max(220, Math.min(height || state.compactHeight, 700)) : state.height;
  if (on) state.compactHeight = h;
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: h }, true);
  saveState();
  broadcast();
}

function setOpacity(v) {
  state.opacity = Math.max(0.4, Math.min(1, Number(v) || 1));
  win.setOpacity(state.opacity);
  saveState();
  broadcast();
}

// The portable exe unpacks to a temp folder, so point Windows at the real exe; in dev, electron.exe needs the app folder.
function loginItem() {
  return {
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
  };
}

function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, ...loginItem() });
  broadcast();
}

// ---------- tray ----------

function trayMenu() {
  const s = publicState();
  return Menu.buildFromTemplate([
    { label: summary || 'ClawdyCalc', enabled: false },
    { type: 'separator' },
    { label: win && win.isVisible() ? 'Hide' : 'Show', accelerator: HOTKEY, click: toggle },
    { label: 'Pin on top', type: 'checkbox', checked: s.pinned, click: (i) => setPinned(i.checked) },
    { label: 'Compact mode', type: 'checkbox', checked: s.compact, click: () => { show(); win.webContents.send('win:toggle-compact'); } },
    {
      label: 'Opacity',
      submenu: [1, 0.9, 0.8, 0.7, 0.6].map((v) => ({
        label: `${Math.round(v * 100)}%`, type: 'radio', checked: Math.abs(s.opacity - v) < 0.01, click: () => setOpacity(v),
      })),
    },
    { label: 'Start with Windows', type: 'checkbox', checked: s.autoStart, visible: process.platform !== 'linux', click: (i) => setAutoStart(i.checked) },
    { type: 'separator' },
    { label: 'Open in browser', click: () => shell.openExternal(serverUrl) },
    { label: 'Quit ClawdyCalc', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip('ClawdyCalc');
  tray.setContextMenu(trayMenu());
  tray.on('click', toggle);
}

// ---------- messages from the page ----------

// only our own page may drive the window
const isOurs = (url) => !!serverUrl && (url === serverUrl || url.startsWith(serverUrl + '/'));
const fromUs = (e) => !!e.senderFrame && isOurs(e.senderFrame.url);

ipcMain.handle('win:get-state', (e) => (fromUs(e) ? publicState() : null));
ipcMain.handle('win:pin', (e, on) => { if (fromUs(e)) setPinned(on); return publicState(); });
ipcMain.handle('win:compact', (e, on, height) => { if (fromUs(e)) setCompact(on, height); return publicState(); });
ipcMain.on('win:minimize', (e) => { if (fromUs(e)) win.minimize(); });
ipcMain.on('win:hide', (e) => { if (fromUs(e)) win.close(); });
ipcMain.on('win:summary', (e, text) => {
  if (!fromUs(e)) return;
  summary = String(text).slice(0, 120);
  if (tray) { tray.setToolTip(`ClawdyCalc\n${summary}`); tray.setContextMenu(trayMenu()); }
});
ipcMain.on('win:background', (e, color) => {
  if (!fromUs(e) || !/^#[0-9a-f]{3,8}$/i.test(color)) return;
  win.setBackgroundColor(color);
  if (state.background !== color) { state.background = color; saveState(); }
});

// ---------- lifecycle ----------

async function boot() {
  state = loadState();
  try {
    serverUrl = await startServer();
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('ClawdyCalc could not start', String(err && err.message || err));
    app.exit(1);
    return;
  }
  createWindow();
  createTray();
  globalShortcut.register(HOTKEY, toggle); // if another app owns it, we just skip the hotkey
}

app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => show()); // macOS dock click
