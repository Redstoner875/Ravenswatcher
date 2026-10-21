'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createBorderlessController, createWindowsNative } = require('./borderless');

function clampBounds(bounds, displays) {
  const fallback = displays[0]?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const number = (v, d) => Number.isFinite(v) ? Math.round(v) : d;
  const width = Math.max(180, Math.min(1200, number(bounds?.width, 350)));
  const height = Math.max(180, Math.min(1200, number(bounds?.height, 350)));
  const x = number(bounds?.x, fallback.x + fallback.width - width - 24), y = number(bounds?.y, fallback.y + 24);
  const area = displays.map(d => d.workArea).find(a => x + width > a.x && x < a.x + a.width && y + height > a.y && y < a.y + a.height) || fallback;
  return { x: Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - width))),
    y: Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - height))),
    width: Math.min(width, area.width), height: Math.min(height, area.height) };
}

function createOverlay({ BrowserWindow, screen, directory, onState, onEnabled = () => {}, platform = process.platform, nativeFactory = createWindowsNative }) {
  const file = path.join(directory, 'overlay-settings.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first launch */ }
  let config = { enabled: saved?.enabled === true, locked: true, borderless: saved?.borderless === true,
    bounds: clampBounds(saved?.bounds, screen.getAllDisplays()) };
  let win = null, ready = false, pid = null, borderless = null, borderlessError = '', retryAt = 0;
  let scene = null, players = null, positions = null, generation = 0, closed = false, saveTimer = null;
  const html = path.join(__dirname, 'web', 'overlay.html');
  const persist = () => {
    clearTimeout(saveTimer); saveTimer = null;
    try {
      fs.writeFileSync(file + '.tmp', JSON.stringify(config)); fs.renameSync(file + '.tmp', file);
    } catch (error) { console.error('[overlay] could not save settings:', error.message); }
  };
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 200); };
  const state = () => ({ ...config, bounds: { ...config.bounds }, generation,
    borderlessActive: borderless?.pid === pid && pid !== null, borderlessError, hasMap: !!scene?.hasMap });
  const notify = () => onState(state());
  const send = (kind, data) => { if (win && !win.isDestroyed() && ready) win.webContents.send('overlay:map', { kind, ...data }); };
  function applyLock() {
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(config.locked, { forward: true });
    win.setFocusable(!config.locked);
    send('settings', { locked: config.locked });
  }
  function ensureWindow() {
    if (!config.enabled || closed || win && !win.isDestroyed()) return;
    config.bounds = clampBounds(config.bounds, screen.getAllDisplays());
    win = new BrowserWindow({ ...config.bounds, minWidth: 180, minHeight: 180, frame: false,
      transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
      skipTaskbar: true, focusable: !config.locked, alwaysOnTop: true, show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
        preload: path.join(__dirname, 'overlay-preload.js') } });
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('did-finish-load', () => {
      ready = true; applyLock();
      if (scene) send('scene', scene);
      if (players) send('players', players);
      if (positions) send('positions', positions);
      win.showInactive();
    });
    const moved = () => { config.bounds = win.getBounds(); scheduleSave(); notify(); };
    win.on('move', moved); win.on('resize', moved);
    win.on('closed', () => {
      win = null; ready = false;
      if (!closed && config.enabled) { config.enabled = false; generation++; onEnabled(false); persist(); notify(); }
    });
    applyLock();
    win.loadURL(pathToFileURL(html).href).catch(error => console.error('[overlay] load failed:', error));
  }
  function applyBorderless() {
    if (!config.borderless || !pid || closed || Date.now() < retryAt) return;
    const previous = state();
    try {
      if (platform !== 'win32') throw new Error('Borderless game control is available on Windows.');
      borderless ||= createBorderlessController(nativeFactory());
      borderless.apply(pid); borderlessError = '';
    } catch (error) { borderlessError = error.message; retryAt = Date.now() + 2000; }
    if (previous.borderlessActive !== state().borderlessActive || previous.borderlessError !== borderlessError) notify();
  }
  return {
    get state() { return state(); },
    start() { onEnabled(config.enabled); ensureWindow(); notify(); },
    configure(input) {
      if (!input || typeof input !== 'object') return state();
      const wasEnabled = config.enabled;
      for (const key of ['enabled', 'locked', 'borderless']) if (typeof input[key] === 'boolean') config[key] = input[key];
      if (input.reset === true) {
        config.bounds = clampBounds(null, [screen.getPrimaryDisplay()]);
        win?.setBounds(config.bounds);
      }
      if (!config.borderless) { borderless?.restore(); borderlessError = ''; }
      retryAt = 0;
      if (config.enabled) { ensureWindow(); applyLock(); }
      else { win?.destroy(); scene = players = positions = null; }
      if (wasEnabled !== config.enabled) { generation++; onEnabled(config.enabled); }
      applyBorderless(); persist(); notify();
      return state();
    },
    observeGame(nextPid) {
      nextPid = Number.isInteger(nextPid) && nextPid > 0 ? nextPid : null;
      if (nextPid !== pid) {
        try { borderless?.restore(); } catch (error) { borderlessError = error.message; }
        pid = nextPid; generation++; retryAt = 0; scene = players = positions = null;
        send('clear', {}); notify();
      }
      applyBorderless();
    },
    receive(payload) {
      if (!config.enabled || !pid || payload?.pid !== pid || typeof payload.scope !== 'string' || payload.scope.length > 100) return;
      if (payload.kind === 'scene' && typeof payload.svg === 'string' && payload.svg.length < 2_000_000) {
        const hadMap = !!scene?.hasMap;
        scene = { svg: payload.svg, scope: payload.scope, hasMap: payload.hasMap === true };
        players = positions = null;
        send('scene', scene);
        if (hadMap !== scene.hasMap) notify();
      } else if (payload.scope === scene?.scope && payload.kind === 'players' && typeof payload.svg === 'string' && payload.svg.length < 200_000) {
        players = { svg: payload.svg }; send('players', players);
      } else if (payload.scope === scene?.scope && payload.kind === 'positions' && Array.isArray(payload.points) && payload.points.length <= 16) {
        const points = payload.points.filter(p => typeof p.id === 'string' && p.id.length < 200 && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e7 && Math.abs(p.y) < 1e7);
        positions = { points }; send('positions', positions);
      }
    },
    resize(event, input) {
      if (!win || config.locked || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame
        || event.senderFrame.url !== pathToFileURL(html).href || !Number.isFinite(input?.width) || !Number.isFinite(input?.height)) return;
      config.bounds = clampBounds({ ...win.getBounds(), width: input.width, height: input.height }, screen.getAllDisplays());
      win.setBounds(config.bounds); scheduleSave();
    },
    displaysChanged() { config.bounds = clampBounds(config.bounds, screen.getAllDisplays()); win?.setBounds(config.bounds); scheduleSave(); notify(); },
    shutdown() {
      if (closed) return;
      closed = true;
      try { borderless?.restore(); } catch (error) { console.error('[overlay] restore failed:', error.message); }
      persist(); win?.destroy();
    },
  };
}
module.exports = { clampBounds, createOverlay };
