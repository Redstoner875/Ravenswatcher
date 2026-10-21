'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const electron = require('electron');
if (typeof electron === 'string') {
  const result = require('child_process').spawnSync(electron, [__filename, ...process.argv.slice(2)], { stdio:'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, protocol, screen, ipcMain } = electron;
const { createOverlay } = require('../../overlay');
const { createBorderlessController, createWindowsNative } = require('../../borderless');
const root = path.resolve(__dirname, '../..');
protocol.registerSchemesAsPrivileged([{ scheme:'asset', privileges:{ standard:true, secure:true, corsEnabled:true } }]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const pixel = require('../../assets/png').encodePng(1, 1, Buffer.from([50, 50, 50, 255]));
  protocol.handle('asset', () => new Response(pixel, { headers:{ 'Content-Type':'image/png' } }));
  const source = new BrowserWindow({ show:false, width:1000, height:800, webPreferences:{ contextIsolation:true, nodeIntegration:false, backgroundThrottling:false } });
  await source.loadFile(path.join(root, 'web/index.html'));
  const js = text => source.webContents.executeJavaScript(text);
  await js(`window.messages=[]; window.ravenswatch={publishOverlay: data=>window.messages.push(data)};
    PoiMap.setOverlay({enabled:true,generation:1});
    PoiMap.setAssets({TERRAIN_MAPS:{'Dark Hills':{image:'fixture.png',projection:'diagonal-half-v1',bounds:{x:-100,y:-100,width:200,height:200}}}});
    PoiMap.render({pid:101,map_id:0,map_name:'Dark Hills',map_tiles:[{id:'chest',name:'Chest',label:'Chest',icon:'map_chest.png',source:'selector',position:{x:0,y:0,z:0}}],players:[{id:'p1',hero:'Hero_Scarlet',position:{x:0,y:0,z:0}}]}); null`);
  assert.equal(await js(`document.getElementById('poi-map-panel').open`), false);
  let scene = await js(`window.messages.filter(m=>m.kind==='scene').at(-1)`);
  assert.ok(scene.svg.includes('poi-terrain')); assert.equal(scene.hasMap, true);
  assert.ok(!scene.svg.includes('poi-hit-target'));
  await js(`document.querySelector('.poi-marker').dispatchEvent(new MouseEvent('click')); null`);
  scene = await js(`window.messages.filter(m=>m.kind==='scene').at(-1)`);
  assert.ok(scene.svg.includes('poi-completed'));
  await js(`const slider=document.getElementById('poi-map-rotation'); slider.value='45'; slider.dispatchEvent(new Event('input')); null`);
  scene = await js(`window.messages.filter(m=>m.kind==='scene').at(-1)`);
  const box = /viewBox="([^"]+)"/.exec(scene.svg)[1].split(' ').map(Number);
  assert.ok(box[2] > 800 && box[3] > 800, 'rotated terrain must fit completely');
  await js(`PoiMap.updatePlayers({pid:101,map_id:0,players:[{id:'p1',hero:'Hero_Scarlet',position:{x:200,y:100,z:0}}]}); null`);
  const layout = await js(`window.messages.filter(m=>m.kind==='players').at(-1)`);
  const positions = await js(`window.messages.filter(m=>m.kind==='positions').at(-1)`);
  assert.ok(layout.svg.includes('data-player-id="p1"')); assert.equal(positions.points.length, 1);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-overlay-ui-'));
  const manager = createOverlay({ BrowserWindow, screen, directory, onState:()=>{} });
  ipcMain.on('overlay:resize', (event, data) => manager.resize(event, data));
  manager.start(); manager.observeGame(101); manager.configure({enabled:true});
  await delay(250);
  const target = BrowserWindow.getAllWindows().find(w=>w!==source);
  if (target.webContents.isLoading()) await new Promise(resolve=>target.webContents.once('did-finish-load',resolve));
  manager.receive(scene); manager.receive(layout); manager.receive(positions);
  await delay(80);
  const targetJS = text => target.webContents.executeJavaScript(text);
  assert.equal(await targetJS(`getComputedStyle(document.body).backgroundColor`), 'rgba(0, 0, 0, 0)');
  assert.equal(await targetJS(`!!document.querySelector('.poi-terrain')`), true);
  assert.equal(await targetJS(`document.querySelector('[data-player-id="p1"]').getAttribute('transform')`), `translate(${positions.points[0].x} ${positions.points[0].y})`);
  assert.equal(target.isFocusable(), false);
  manager.configure({locked:false}); assert.equal(target.isFocusable(), true);
  await targetJS(`window.overlay.resize({width:420,height:390}); null`); await delay(50);
  assert.equal(target.getBounds().width, 420);
  manager.configure({locked:true});
  await targetJS(`window.overlay.resize({width:600,height:500}); null`); await delay(50);
  assert.equal(target.getBounds().width, 420);
  const sanitized = await targetJS(`OverlayView.safeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>window.bad=1</script><foreignObject/><image href="https://example.com/x" onload="window.bad=1"/></svg>').outerHTML`);
  assert.ok(!sanitized.includes('<script') && !sanitized.includes('foreignObject') && !sanitized.includes('onload') && !sanitized.includes('example.com'));

  if (process.platform === 'win32') {
    // Only manipulate a window this test owns. Never attach to a game.
    const fixture = new BrowserWindow({ width:760,height:520,show:true });
    await fixture.loadURL('about:blank'); await delay(100);
    const native = createWindowsNative(), controller = createBorderlessController(native);
    const handle = native.find(process.pid); assert.ok(handle);
    const before = native.snapshot(handle);
    try {
      controller.apply(process.pid); assert.equal(controller.pid, process.pid);
      const after = native.snapshot(handle);
      assert.ok(after.bounds.width >= before.bounds.width);
      controller.restore(); await delay(80);
      const restored = native.snapshot(handle);
      assert.equal(restored.style, before.style); assert.deepEqual(restored.bounds, before.bounds);
    } finally { controller.restore(); fixture.destroy(); }
  }
  manager.shutdown(); source.destroy();
  fs.rmSync(directory,{recursive:true,force:true});
  console.log('test-overlay-window: ok (closed-panel mirror, terrain, completion, full fit, players, transparency, lock/resize, SVG safety and native borderless restore)');
  app.exit(0);
}
app.whenReady().then(main).catch(error=>{console.error(error);app.exit(1)});
