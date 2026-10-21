'use strict';
const { JSDOM } = require('jsdom');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { heroIdentity, motionPosition } = require('../poi-map');
const icons = { Fixture: 'fixture.png', Other: 'other.png' };
const entities = { Hero_Example: 'Fixture', Hero_Example_Long: 'Other' };
assert.equal(heroIdentity('Hero_Example_Skin', icons, entities).icon, 'fixture.png');
assert.equal(heroIdentity('Hero_Example_Long_Skin', icons, entities).icon, 'other.png');
assert.equal(heroIdentity('Hero_ExampleWrong', icons, entities).icon, null);
assert.equal(heroIdentity(undefined, icons, entities).icon, null);
assert.equal(heroIdentity('Hero_Fixture_Skin', icons).icon, 'fixture.png');
assert.deepEqual(motionPosition({ from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 20, z: 4 }, at: 100 }, 125), { x: 5, y: 10, z: 2 });
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  runScripts: 'outside-only', url: 'https://fixture.test', pretendToBeVisual: true,
});
const w = dom.window, d = w.document;
let now = 0, next = 0;
const callbacks = new Map();
w.performance.now = () => now;
w.requestAnimationFrame = fn => { callbacks.set(++next, fn); return next; };
w.cancelAnimationFrame = id => callbacks.delete(id);
function step(t) {
  now = t;
  const pending = [...callbacks.values()]; callbacks.clear();
  for (const fn of pending) fn(t);
}
w.eval(fs.readFileSync(path.join(root, 'poi-map.js'), 'utf8'));
d.getElementById('poi-map-panel').open = true;
w.PoiMap.setAssets({ HERO_ICONS: icons, HERO_ENTITIES: entities });
const pos = x => ({ x, y: 0, z: 0 });
const players = [ { id: 'a', hero: 'Hero_Example_Skin', position: pos(0) },
  { id: 'b', hero: 'Hero_Example_Long', position: pos(20) } ];
const state = { pid: 5, map_id: 0, map_tiles: [
  { id: 'poi', name: 'Basic_Chest_T1', source: 'selector', position: pos(0) },
  { id: 'poi2', name: 'Basic_Chest_T1', source: 'selector', position: pos(100) },
], players };
w.PoiMap.render(state);
assert.equal(d.querySelectorAll('.poi-player image').length, 2);
assert.equal(d.querySelector('.poi-player image').getAttribute('href'), 'asset://icons/fixture.png');
assert.equal(d.getElementById('poi-map-player').value, '', 'co-op never guesses your identity');
assert.match(d.getElementById('poi-map-player').textContent, /Fixture/);
const poi = d.querySelector('.poi-marker');
const initial = d.querySelector('.poi-player').getAttribute('transform');
now = 50;
w.PoiMap.updatePlayers({ pid: 5, map_id: 0, players: [{ ...players[0], position: pos(10) }, players[1]] });
assert.equal(d.querySelector('.poi-player').getAttribute('transform'), initial, 'starts at previous position');
step(75);
const middle = d.querySelector('.poi-player').getAttribute('transform');
assert.notEqual(middle, initial, 'animates between position reads');
step(100);
assert.notEqual(d.querySelector('.poi-player').getAttribute('transform'), middle);
assert.equal(callbacks.size, 0, 'animation stops when settled');
assert.equal(d.querySelector('.poi-marker'), poi, 'fast updates preserve POI nodes');
w.PoiMap.updatePlayers({ pid: 99, map_id: 0, players: [] });
assert.equal(d.querySelectorAll('.poi-player').length, 2, 'old process frame is ignored');
w.PoiMap.updatePlayers({ pid: 5, map_id: 1, players: [] });
assert.equal(d.querySelectorAll('.poi-player').length, 2, 'wrong map frame is ignored');
d.querySelector('.poi-player image').dispatchEvent(new w.Event('error'));
assert.equal(d.querySelector('.poi-player').querySelector('image'), null, 'missing portrait falls back to diamond');
w.PoiMap.render({ ...state, map_id: 1, players: [{ id: 'a', position: pos(100) }] });
assert.equal(d.querySelector('.poi-player image'), null, 'unknown identity keeps visible marker');
w.PoiMap.updatePlayers({ pid: 5, map_id: 1, players: [] });
assert.equal(d.querySelectorAll('.poi-player').length, 0);
w.PoiMap.render({ ...state, no_run: true });
w.PoiMap.updatePlayers({ pid: 5, map_id: 0, players });
assert.equal(d.querySelectorAll('.poi-player').length, 0, 'fast frames cannot restore players outside a run');
dom.window.close();
console.log('PASS co-op portraits, skin matching, 50 ms interpolation, stationary cleanup, scoped updates and missing-art fallback');
