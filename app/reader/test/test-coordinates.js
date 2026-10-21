'use strict';
const assert = require('assert/strict');
const tiles = require('../tiles');
const { mapTiles, readState } = require('../state');
const { model } = require('../../web/poi-map');
function main() {
  const mem = new Map();
  const put = (a, b) => { for (let i = 0; i < b.length; i++) mem.set(a + i, b[i]); };
  const ptr = (a, v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); put(a, b); };
  const f32 = (a, v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); put(a, b); };
  const proc = {
    read(a, n) { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) { if (!mem.has(a+i)) return null; b[i] = mem.get(a+i); } return b; },
    readPtr(a) { const b = this.read(a, 8); return b ? Number(b.readBigUInt64LE()) : null; },
    readI32(a) { const b = this.read(a, 4); return b ? b.readInt32LE() : null; },
  };
  const slot = 0x20000, entity = 0x30000, resource = 0x40000, str = 0x50000, selector = 0x60000;
  const name = '4x4_Camp_Test';
  ptr(resource + 0xa0, str); const len = Buffer.alloc(4); len.writeUInt32LE(name.length); put(resource + 0xa8, len); put(str, Buffer.from(name));
  ptr(slot + 0x10, resource); f32(slot + 0x20, 0.5); ptr(slot + 0x18, entity);
  // Literal offsets make this a layout regression check, independent of exported constants.
  ptr(entity, 0x88888); f32(entity + 0x2e0, -120); f32(entity + 0x2e4, 17); f32(entity + 0x2e8, 240);
  const first = tiles.readTileSlot(proc, slot, 'category', 0, new Set([0x88888]));
  assert.deepEqual(first.position, { x: -120, y: 240, z: 17 });
  assert.equal(tiles.readTileSlot(proc, slot, 'category', 0, new Set([0x99999])).position, null);
  ptr(selector + 0x78, resource); f32(selector + 0x68, 0.15);
  f32(selector + 0x6c, 360); f32(selector + 0x70, -3); f32(selector + 0x74, 0);
  // No owner entity or exploration memory exists: stored placements still work.
  const reward = tiles.readRewardSelector(proc, selector);
  assert.deepEqual(reward.position, { x: 360, y: 0, z: -3 });
  const interior = tiles.readTileSlot(proc, slot, 'sublevel');
  assert.deepEqual(interior.position, first.position);
  const raw = [first, { ...first, id: 'another-instance', position: { x: 0, y: 0, z: 0 } }, reward, interior];
  assert.equal(mapTiles(raw).length, 4); // no grouping or exploration filter
  const spawnNames = ['Start_Update3', 'Starting_Tile_Update3',
    '40x40_Dark_Hills_Start_Update3', '64x64_Storm_Island_Starting_Tile_Update3',
    '40x40_Avalon_Starting_Tile_Update3'];
  for (const name of spawnNames) {
    const spawn = mapTiles([{ ...first, name }])[0];
    assert.equal(spawn.icon, 'map_spawn.png');
    assert.equal(spawn.label, 'Spawn area');
    assert.equal(spawn.outline, null);
    assert.deepEqual(spawn.position, first.position);
  }
  for (const name of ['Start_Update30', 'Restart_Update3', 'Starting_Tile_Update30']) {
    assert.notEqual(mapTiles([{ ...first, name }])[0].icon, 'map_spawn.png');
  }
  assert.equal(readState(null, { values: {}, tiles: raw }).map_tiles.length, 4);
  const [harp, altar] = mapTiles([{ ...first, name: '6x6_Ruin_01' }, { ...first, name: '6x6_Bleeding_01' }]);
  assert.equal(harp.icon, 'map_harp.png'); assert.equal(harp.label, "Dagda's Harp");
  assert.equal(altar.icon, 'map_sacrificial_altar.png'); assert.equal(altar.label, 'Sacrificial Altar');
  const arena={...first,id:'arena',source:'sublevel',name:'64x64_JackQuest_OgreArena',position:{x:-350,y:350,z:0}};
  const entrance={...first,id:'entrance',name:'40x40_JackQuest_BeanstalkGrowsPlace',position:{x:-50,y:87,z:8}};
  const themed=mapTiles([entrance,arena,
    {...first,name:'40x40_DarkHills_Thieves_Stashes_Entrance_Combat_Room_01'},
    {...first,name:'40x40_DarkHills_Thieves_Stashes_Entrance_Gold_Room_01'},
    {...first,name:'40x40_DarkHills_Thieves_Stashes_Entrance_Mirror_Room_01'},
    {...first,name:'6x6_Healing_01'}, {...first,name:'64x64_JackQuest_JackOldHouseCamp'}]);
  assert.equal(themed[0].icon,'map_side_quest.png'); assert.equal(themed[0].linkedSublevel,undefined);
  assert.deepEqual(themed[0].position,entrance.position);assert.deepEqual(themed[1].position,arena.position);
  assert.equal(themed[1].source,'sublevel');assert.equal(themed[1].icon,'map_side_quest.png');
  assert.equal(model(themed).rows.some(t=>t.id==='arena'),false);assert.equal(model(themed).rows.some(t=>t.id==='entrance'),true);
  assert.equal(themed[2].icon,'map_thieves_stash.png');assert.equal(themed[3].icon,'map_thieves_stash.png');
  assert.equal(themed[4].icon,'map_mirror.png');assert.equal(themed[5].icon,'map_healing.png');assert.equal(themed[6].icon,'map_side_quest.png');
  assert.equal(tiles.tilesChanged([first], [{ ...first, position: { ...first.position, x: 1 } }]), true);
  assert.equal(tiles.tilesChanged([first], [{ ...first, position: { ...first.position } }]), false);
  assert.equal(tiles.readPosition(proc, 0x70000), null);
  f32(selector + 0x6c, NaN); assert.equal(tiles.readRewardSelector(proc, selector).position, null);
  f32(selector + 0x6c, Infinity); assert.equal(tiles.readRewardSelector(proc, selector).position, null);
  f32(selector + 0x6c, 1e8); assert.equal(tiles.readRewardSelector(proc, selector).position, null);
  f32(selector + 0x6c, 0); f32(selector + 0x70, 0); f32(selector + 0x74, 0);
  assert.deepEqual(tiles.readRewardSelector(proc, selector).position, { x: 0, y: 0, z: 0 });
  ptr(slot + 0x18, 0); assert.equal(tiles.readTileSlot(proc, slot, 'category').position, null);
  f32(slot + 0x20, -1); assert.equal(tiles.readTileSlot(proc, slot, 'category'), null);
  const m = model(mapTiles(raw)); assert.equal(m.points.length, 3);
  const p = m.project(first.position); assert.deepEqual(m.world(p), { x: -120, y: 240 });
  assert.equal(model(mapTiles(raw), 'sublevel').points.length, 1);
  assert.equal(model(mapTiles(raw), 'all').points.length, 4);
  assert.equal(model([{ position: null }]).missing, 1);
  assert.deepEqual(model([{ position: { x: 0, y: 0, z: 0 } }]).project({ x: 0, y: 0 }), { x: 400, y: 300 });
  assert.equal(model(null).rows.length, 0);
  console.log('PASS coordinate extraction, missing/invalid data, RTTI guard, unexplored placements, identity, state propagation, layers, projection');
  return 0;
}
if (require.main === module) main();
module.exports = { main };
