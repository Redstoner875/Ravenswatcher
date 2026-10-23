'use strict';
const assert = require('assert/strict');
const { locate, selected, applyChange } = require('../bench/talent-rarity-edit');
const { RUN_CLASSES: C } = require('../runs');

function main() {
  const base = 0x10000, bytes = Buffer.alloc(0x10000);
  const controller = base, entity = base + 0x1000, runtime = base + 0x2000;
  const definition = base + 0x3000, settings = base + 0x4000, components = base + 0x5000;
  const record = base + 0x6000, entries = base + 0x7000, skill = base + 0x8000;
  const hero = base + 0x9000, chosen = base + 0xA000;
  const guid = '717e49d62fdb8d4bad49eb879056b1e4';
  const classes = new Map([[controller, C.controller], [runtime, C.runtime],
    [definition, C.settings], [record, C.record], [skill, C.skill], [hero, C.hero]]);
  const ptr = (at, value) => bytes.writeBigUInt64LE(BigInt(value), at - base);
  const i32 = (at, value) => bytes.writeInt32LE(value, at - base);
  const vec = (at, value, count) => { ptr(at, value); i32(at + 8, count); i32(at + 12, count); };
  const str = (at, value, target) => { vec(at, target, value.length); bytes.write(value, target - base); };
  ptr(controller + 8, entity); ptr(entity + 0x30, base + 0xB000); ptr(entity + 0x28, settings);
  str(settings + 8, 'Hero_SunWukong_Default', base + 0xC000);
  vec(entity + 0x190, components, 1); ptr(components, runtime);
  ptr(runtime + 8, entity); ptr(runtime + 0x10, definition); ptr(definition + 0x18, definition);
  str(definition + 0xE8, 'Skill Controller Passive Objects Quest', base + 0xC100);
  Buffer.from(guid, 'hex').copy(bytes, definition - base + 0x88);
  ptr(record + 0x20, settings); vec(record + 0x10, entries, 2);
  ptr(entries, skill); ptr(entries + 8, hero); vec(hero + 0xE8, chosen, 1);
  Buffer.from(guid, 'hex').copy(bytes, skill - base + 0x20);
  Buffer.from(guid, 'hex').copy(bytes, chosen - base);
  i32(skill + 0x50, 1);
  const proc = { read(at, size) {
    return at >= base && at + size <= base + bytes.length
      ? Buffer.from(bytes.subarray(at - base, at - base + size)) : null;
  } };
  const classOf = at => classes.get(at) ?? null;
  const found = { controllers: [controller], records: [record], settings: [definition], runtimes: [runtime] };
  const resolve = () => locate(proc, classOf, found);
  const target = resolve();
  assert.equal(target.current, 1);
  let writes = 0;
  const write = (at, payload) => { writes++; payload.copy(bytes, at - base); return payload.length; };
  const before = Buffer.from(bytes);
  assert.deepEqual(applyChange(resolve, write, target, 2), { changed: true, previous: 1, current: 2 });
  const expected = Buffer.from(before); expected.writeInt32LE(2, skill - base + 0x50);
  assert.deepEqual(bytes, expected, 'only the four-byte rarity field can change');
  assert.equal(writes, 1);
  assert.deepEqual(applyChange(resolve, write, resolve(), 2), { changed: false, current: 2 });
  assert.equal(writes, 1, 'no write when already at requested rarity');
  assert.throws(() => applyChange(resolve, write, target, 3), /changed since preview/);
  assert.throws(() => applyChange(resolve, write, resolve(), 4), /Unsupported/);
  assert.equal(writes, 1, 'stale and invalid requests do not write');
  assert.throws(() => applyChange(resolve, () => 0, resolve(), 3), /Write failed/);
  assert.throws(() => applyChange(resolve, () => 4, resolve(), 3), /could not be verified/);
  vec(hero + 0xE8, chosen, 0);
  assert.equal(selected(proc, classOf, record, guid), false);
  assert.throws(resolve, /not selected/);
  vec(hero + 0xE8, chosen, 2);
  Buffer.from(guid, 'hex').copy(bytes, chosen - base + 16);
  assert.equal(selected(proc, classOf, record, guid), false, 'duplicate chosen GUIDs rejected');
  vec(hero + 0xE8, chosen, 1);
  classes.delete(runtime);
  assert.throws(resolve, /Expected one live/);
  console.log('test-talent-rarity-edit: passed');
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
