'use strict';
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const fs = require('fs'), os = require('os'), path = require('path');
const { clampBounds, createOverlay } = require('../../overlay');
const { createBorderlessController } = require('../../borderless');

async function main() {
  const display = { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } };
  assert.deepEqual(clampBounds({ x: 99999, y: -500, width: 350, height: 350 }, [display]), { x: -350, y: 0, width: 350, height: 350 });
  assert.equal(clampBounds({ width: NaN, height: 99999 }, [display]).height, 1040);
  const calls = [], original = { style: 123, bounds: { x: 50, y: 60, width: 800, height: 600 } };
  let alive = true, fail = false;
  const native = {
    find: pid => pid === 101 ? 7 : null,
    valid: (handle, pid) => alive && handle === 7 && pid === 101,
    snapshot: () => original,
    borderless: () => { calls.push('apply'); if (fail) throw Error('Resize failed'); },
    restore: (_handle, snapshot) => { assert.equal(snapshot, original); calls.push('restore'); },
  };
  const controller = createBorderlessController(native);
  assert.throws(() => controller.apply(null), /Windowed/);
  controller.apply(101); controller.apply(101);
  assert.deepEqual(calls, ['apply']);
  controller.restore(); assert.deepEqual(calls, ['apply', 'restore']);
  controller.apply(101); alive = false; controller.restore();
  assert.equal(calls.at(-1), 'apply'); // do not touch a dead or recycled window
  alive = true; fail = true;
  assert.throws(() => controller.apply(101), /Resize failed/);
  assert.equal(controller.pid, null); assert.equal(calls.at(-1), 'restore'); fail = false;

  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x:options.x, y:options.y, width:options.width, height:options.height }; this.messages = [];
      this.webContents = new EventEmitter(); this.webContents.mainFrame = {};
      this.webContents.send = (channel, data) => this.messages.push({ channel, data });
      this.webContents.setWindowOpenHandler = () => {}; windows.push(this);
    }
    isDestroyed() { return !!this.destroyed; }
    setMenu() {}
    setAlwaysOnTop() {}
    setFocusable(value) { this.focusable = value; }
    setIgnoreMouseEvents(value) { this.clickThrough = value; }
    showInactive() { this.shown = true; }
    getBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; this.emit('resize'); }
    loadURL(url) { this.webContents.mainFrame.url = url; queueMicrotask(() => this.webContents.emit('did-finish-load')); return Promise.resolve(); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-overlay-'));
  try {
    const manager = createOverlay({ BrowserWindow:FakeWindow, screen:{ getAllDisplays:()=>[display], getPrimaryDisplay:()=>display },
      directory, onState:()=>{}, platform:'win32', nativeFactory:()=>native });
    manager.start(); assert.equal(windows.length, 0);
    manager.configure({ enabled:true }); await Promise.resolve();
    const win = windows[0];
    assert.equal(win.options.transparent, true); assert.equal(win.options.resizable, false);
    assert.equal(win.clickThrough, true); assert.equal(win.focusable, false);
    manager.configure({ locked:false }); assert.equal(win.clickThrough, false); assert.equal(win.focusable, true);
    manager.observeGame(101);
    manager.receive({ kind:'scene', pid:999, scope:'x', svg:'<svg/>', hasMap:true }); assert.equal(manager.state.hasMap, false);
    manager.receive({ kind:'scene', pid:101, scope:'101|0', svg:'<svg/>', hasMap:true }); assert.equal(manager.state.hasMap, true);
    const before = win.messages.length;
    manager.receive({ kind:'positions', pid:101, scope:'101|1', points:[] }); assert.equal(win.messages.length, before);
    manager.resize({ sender:{}, senderFrame:win.webContents.mainFrame }, { width:800,height:800 }); assert.equal(win.bounds.width, 350);
    manager.resize({ sender:win.webContents, senderFrame:win.webContents.mainFrame }, { width:420,height:410 }); assert.equal(win.bounds.width, 420);
    manager.configure({ locked:true });
    manager.resize({ sender:win.webContents, senderFrame:win.webContents.mainFrame }, { width:800,height:800 }); assert.equal(win.bounds.width, 420);
    manager.configure({ borderless:true }); assert.equal(manager.state.borderlessActive, true);
    manager.observeGame(null); assert.equal(manager.state.hasMap, false); assert.equal(manager.state.borderlessActive, false);
    manager.shutdown(); assert.equal(win.destroyed, true);
    const next = createOverlay({ BrowserWindow:FakeWindow, screen:{ getAllDisplays:()=>[display],getPrimaryDisplay:()=>display },directory,onState:()=>{} });
    assert.equal(next.state.bounds.width, 420); assert.equal(next.state.locked, true); next.shutdown();
  } finally { fs.rmSync(directory, { recursive:true, force:true }); }
  console.log('test-overlay: ok (click-through, resize authorization, saved bounds, PID isolation and reversible borderless)');
  return 0;
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
