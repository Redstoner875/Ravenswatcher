'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main() {
  const timers = new Map(), handlers = {}, frames = [];
  let nextTimer = 0, mapId = 0, closed = 0, fullReads = 0, positionReads = 0;
  const heroes = [{ id: 'a', hero: 'Hero_Fixture_Skin', position: { x: 1, y: 2, z: 0 } },
    { id: 'b', hero: 'Hero_Other', position: { x: 3, y: 4, z: 0 } }];
  class Reader {
    constructor() { this.pid = 10; this.base = 0x10000; this.exePath = '/game/Ravenswatch.exe'; }
    alive() { return true; }
    get() { return mapId; }
    found() { return 2; }
    players() { positionReads++; return heroes; }
    close() { closed++; return Promise.resolve(); }
  }
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    require(name) {
      if (name === './state') return {
        POLL_MS: 250, CURRENT_MAP_ID: 'Current map id', SWEEP_INTERVAL: 5, PROCESS_NAME: 'fixture',
        readState() { fullReads++; return { pid: 10, map_id: mapId, no_run: mapId < 0, players: heroes }; },
      };
      if (name === './reader') return { Reader };
      if (name === 'fs') return { fstatSync: () => ({ isCharacterDevice: () => true }) };
      return require(name);
    },
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    process: {
      stdout: { write: line => frames.push(JSON.parse(line)), on() {} },
      stderr: { write() {} }, stdin: {}, on: (name, fn) => { handlers[name] = fn; }, exit() {},
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../stdio.js'), 'utf8'), sandbox);
  mod.exports.main([]);
  const fast = [...timers.values()].find(t => t.ms === 50);
  const slow = [...timers.values()].find(t => t.ms === 250);
  assert.ok(fast && slow, 'independent player and state timers');
  for (let ms = 50; ms <= 500; ms += 50) {
    heroes[0].position.x++;
    fast.fn();
    if (ms % 250 === 0) slow.fn();
  }
  assert.equal(fullReads, 3, 'full state remains at 250 ms');
  assert.equal(positionReads, 10, 'positions sampled every 50 ms');
  assert.equal(frames.filter(f => f.type === 'players').length, 10);
  assert.equal(frames.at(-2).players.length, 2, 'all co-op positions are sent');
  assert.equal(frames[0].player_poll_ms, 50);
  mapId = 1; fast.fn();
  assert.equal(frames.at(-1).players.length, 0, 'map change cannot reuse previous hero addresses');
  slow.fn(); fast.fn();
  assert.equal(frames.at(-1).players.length, 2);
  mapId = -1; slow.fn(); fast.fn();
  assert.equal(frames.at(-1).players.length, 0, 'menu clears players');
  handlers.SIGTERM();
  await Promise.resolve();
  assert.equal(timers.size, 0, 'shutdown clears both timers');
  assert.equal(closed, 1);
  console.log('PASS 50 ms co-op stream, separate 250 ms state polling, transition guards and timer cleanup');
  return 0;
}
module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
