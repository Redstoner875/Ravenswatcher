'use strict';
const assert = require('assert/strict');
const { locate, selected, listTalents, chooseTalent, applyChange } = require('../bench/talent-rarity-edit');
const { RUN_CLASSES: C, readTalents } = require('../runs');

function main() {
  const base = 0x10000, bytes = Buffer.alloc(0x30000);
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
  const listener = base + 0xD000, owner = base + 0xE000;
  classes.set(listener, C.text);
  ptr(runtime + 0xA8, listener);
  str(listener + 8, 'Thirst for Immortality', base + 0xC200);
  ptr(definition + 0x48, owner);
  str(owner + 8, 'Hero_SunWukong', base + 0xC300);
  str(record + 0x70, 'Heroes\\Sun_Wukong_Update6.herodef.ot', base + 0xC400);
  const resolve = () => locate(proc, classOf, found, guid);
  assert.equal(readTalents(proc, record, classOf, found.settings, found.runtimes)[0].name, 'Thirst for Immortality',
    'explicit Wukong alias resolves display names');
  assert.equal(readTalents(proc, record, classOf, found.settings, found.runtimes)[0].guid, guid);
  str(owner + 8, 'Hero_Sun_Wukong', base + 0xC300);
  assert.equal(readTalents(proc, record, classOf, found.settings, found.runtimes)[0].name, 'Thirst for Immortality',
    'the original exact owner spelling still works');
  str(owner + 8, 'Hero_Unrelated', base + 0xC300);
  assert.throws(() => readTalents(proc, record, classOf, found.settings, found.runtimes), /expected one Hero_Sun_Wukong definition/,
    'the alias does not accept another hero');
  str(owner + 8, 'Hero_SunWukong', base + 0xC300);
  const duplicate = base + 0xF000;
  proc.read(definition, 0x250).copy(bytes, duplicate - base);
  ptr(duplicate + 0x18, duplicate);
  classes.set(duplicate, C.settings);
  assert.throws(() => readTalents(proc, record, classOf, [...found.settings, duplicate], found.runtimes), /got 2/,
    'ambiguous definitions remain rejected');
  const catalog = listTalents(proc, classOf, found);
  assert.equal(catalog[0].name, 'Thirst for Immortality');
  assert.equal(chooseTalent(catalog, 'thirst').guid, guid, 'legacy shortcut still works');
  assert.equal(chooseTalent(catalog, 'THIRST FOR IMMORTALITY').guid, guid);
  assert.equal(chooseTalent(catalog, guid).guid, guid);
  assert.equal(chooseTalent(catalog, guid.toUpperCase()).guid, guid);
  assert.throws(() => chooseTalent([...catalog, { ...catalog[0], guid: 'aa'.repeat(16) }], catalog[0].name), /ambiguous/);
  assert.throws(() => chooseTalent(catalog, 'not selected'), /unavailable/);
  ptr(runtime + 0xA8, 0);
  assert.equal(listTalents(proc, classOf, found)[0].nameSource, 'internal', 'unavailable localization keeps GUID access');
  ptr(runtime + 0xA8, listener);
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
  assert.throws(() => selected(proc, classOf, record, guid), /Duplicate selected/, 'duplicate chosen GUIDs rejected');
  vec(hero + 0xE8, chosen, 1);
  const secondGuid = 'ab'.repeat(16);
  const runtime2 = base + 0x11000, definition2 = base + 0x12000, skill2 = base + 0x13000;
  const listener2 = base + 0x14000;
  classes.set(runtime2, C.runtime); classes.set(definition2, C.settings);
  classes.set(skill2, C.skill); classes.set(listener2, C.text);
  ptr(runtime2 + 8, entity); ptr(runtime2 + 0x10, definition2);
  ptr(runtime2 + 0xA8, listener2); str(listener2 + 8, 'Fixture Ultimate', base + 0xC500);
  ptr(definition2 + 0x18, definition2); ptr(definition2 + 0x48, owner);
  str(definition2 + 0xE8, 'Skill Fixture Ultimate', base + 0xC600);
  Buffer.from(secondGuid, 'hex').copy(bytes, definition2 - base + 0x88);
  Buffer.from(secondGuid, 'hex').copy(bytes, skill2 - base + 0x20);
  Buffer.from(secondGuid, 'hex').copy(bytes, chosen - base + 16);
  vec(hero + 0xE8, chosen, 2); vec(entity + 0x190, components, 2); ptr(components + 8, runtime2);
  vec(record + 0x10, entries, 3); ptr(entries + 16, skill2);
  i32(skill2 + 0x50, 4);
  found.settings.push(definition2); found.runtimes.push(runtime2);
  const all = listTalents(proc, classOf, found);
  assert.deepEqual(all.map(t => [t.name, t.editable]), [['Thirst for Immortality', true], ['Fixture Ultimate', false]]);
  assert.throws(() => locate(proc, classOf, found, secondGuid), /Ultimate/);
  i32(skill2 + 0x50, -1);
  assert.throws(() => locate(proc, classOf, found, secondGuid), /unknown/);
  i32(skill2 + 0x50, 1);
  str(settings + 8, 'Hero_Fixture_Default', base + 0xC000);
  const secondResolve = () => locate(proc, classOf, found, secondGuid);
  assert.deepEqual(applyChange(secondResolve, write, secondResolve(), 3), { changed: true, previous: 1, current: 3 },
    'a second GUID on another hero uses the same scoped edit path');
  assert.equal(proc.read(skill + 0x50, 4).readInt32LE(), 2, 'editing another talent leaves the first intact');
  classes.delete(runtime);
  assert.throws(resolve, /Expected one live/);
  console.log('test-talent-rarity-edit: passed');
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
