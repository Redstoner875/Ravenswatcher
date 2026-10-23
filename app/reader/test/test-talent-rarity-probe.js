'use strict';
const assert = require('assert/strict');
const { capture, compare, captureEffects } = require('../bench/talent-rarity-watch');
const { RUN_CLASSES: C } = require('../runs');

function main() {
  const base = 0x10000;
  const memory = Buffer.alloc(0x10000);
  const controller = base, entity = base + 0x1000, runtime = base + 0x2000;
  const definition = base + 0x3000, settings = base + 0x4000, components = base + 0x5000;
  const classes = new Map([[controller, C.controller], [runtime, C.runtime], [definition, C.settings]]);
  const pointer = (at, value) => memory.writeBigUInt64LE(BigInt(value), at - base);
  function string(at, text, target) {
    pointer(at, target);
    memory.writeUInt32LE(text.length, at - base + 8);
    memory.writeUInt32LE(text.length, at - base + 12);
    memory.write(text, target - base);
  }
  pointer(controller + 8, entity);
  pointer(entity + 0x30, base + 0x6000);
  pointer(entity + 0x28, settings);
  string(settings + 8, 'Hero_Fixture', base + 0x7000);
  pointer(entity + 0x190, components);
  memory.writeInt32LE(1, entity - base + 0x198);
  memory.writeInt32LE(1, entity - base + 0x19C);
  pointer(components, runtime);
  pointer(runtime + 8, entity);
  pointer(runtime + 0x10, definition);
  pointer(definition + 0x18, definition);
  string(definition + 0xE8, 'Skill_Fixture', base + 0x7100);
  const proc = { read(at, size) {
    if (at < base || at + size > base + memory.length) return null;
    return Buffer.from(memory.subarray(at - base, at - base + size));
  } };
  const classOf = at => classes.get(at) ?? null;
  const found = { controllers: [controller, controller], records: [], settings: [], runtimes: [] };
  const before = capture(proc, classOf, found);
  assert.equal(before.objects.length, 1, 'deduplicates controllers');
  assert.equal(before.objects[0].key, 'Skill_Fixture');
  assert.deepEqual(compare(before, capture(proc, classOf, found)), [], 'idle samples do not invent changes');
  // Synthetic change to an untyped word; this is not a claimed rarity offset.
  memory.writeInt32LE(2, runtime - base + 0x100);
  const after = capture(proc, classOf, found);
  const changes = compare(before, after);
  assert.deepEqual(changes[0].words, [{ offset: '0x100', before: '00000000',
    after: '02000000', before_i32: 0, after_i32: 2,
    before_f32: 0, after_f32: 2.802596928649634e-45 }]);
  pointer(entity + 0x30, base + 0x6100);
  assert.deepEqual(compare(after, capture(proc, classOf, found)).map(c => c.state), ['added', 'removed'],
    'a new owner context is not an upgrade to the old object');
  pointer(runtime + 8, base + 0x9000);
  assert.equal(capture(proc, classOf, found).objects.length, 0, 'rejects another entity\'s skills');
  pointer(runtime + 8, entity);
  const short = { read(at, size) {
    const bytes = proc.read(at, size);
    return at === runtime ? bytes.subarray(0, 8) : bytes;
  } };
  const broken = capture(short, classOf, found);
  assert.equal(broken.objects.length, 0, 'rejects partial memory reads');
  assert.equal(broken.errors.length, 1, 'records unavailable data explicitly');
  const record = base + 0x8000, entries = base + 0x9000, skill = base + 0xA000;
  classes.set(record, C.record);
  classes.set(skill, C.skill);
  pointer(record + 0x20, settings);
  pointer(record + 0x10, entries);
  memory.writeInt32LE(1, record - base + 0x18);
  memory.writeInt32LE(1, record - base + 0x1C);
  pointer(entries, skill);
  memory.fill(0xAB, skill - base + 0x20, skill - base + 0x30);
  const recordFound = { ...found, controllers: [], records: [record, record] };
  const common = capture(proc, classOf, recordFound);
  assert.equal(common.objects.length, 1, 'deduplicates persistent records');
  assert.equal(common.objects[0].rarity_code, 0, 'Common is a valid zero rarity');
  assert.equal(common.objects[0].guid, 'ab'.repeat(16));
  assert.equal(common.records[0].talents, null, 'missing selected-talent data is unavailable');
  assert.ok(common.records[0].talentError);
  memory.writeInt32LE(1, skill - base + 0x50);
  const savedChange = compare(common, capture(proc, classOf, recordFound));
  assert.equal(savedChange[0].words[0].offset, '0x50');
  assert.equal(savedChange[0].words[0].before_i32, 0);
  assert.equal(savedChange[0].words[0].after_i32, 1);
  const effect = base + 0xB000, listener = base + 0xC000, leaf = base + 0xD000;
  const foreign = base + 0xE000;
  classes.set(effect, '.?AVFixturePowerController@@');
  classes.set(listener, C.int); classes.set(leaf, '.?AVFixtureValueCache@@');
  classes.set(foreign, '.?AVFixtureForeignController@@');
  pointer(effect + 8, entity); pointer(effect + 0x80, listener);
  pointer(listener + 0x20, leaf); pointer(leaf + 0x28, effect);
  pointer(foreign + 8, base + 0xF000);
  pointer(components + 8, effect); pointer(components + 16, foreign);
  memory.writeInt32LE(3, entity - base + 0x198);
  memory.writeInt32LE(3, entity - base + 0x19C);
  const roots = capture(proc, classOf, found).objects;
  const deepBefore = captureEffects(proc, classOf, roots);
  assert.equal(deepBefore.errors.length, 0);
  assert.deepEqual(deepBefore.objects.map(o => o.address), [runtime, effect, listener, leaf],
    'owned components and two pointer hops are captured, cycles and foreign roots excluded');
  memory.writeFloatLE(2.5, listener - base + 8);
  const deepAfter = captureEffects(proc, classOf, roots);
  const effectChange = compare(deepBefore, deepAfter);
  assert.equal(effectChange.length, 1);
  assert.equal(effectChange[0].address, listener);
  assert.equal(effectChange[0].words[0].after_f32, 2.5, 'floating-point effect changes remain visible');
  assert.equal(effectChange[0].class_name, C.int);
  assert.equal(captureEffects(proc, classOf, roots, 1).truncated, true, 'node limits are explicit');
  const unreadable = { read(at, size) { return at === listener ? null : proc.read(at, size); } };
  const missing = captureEffects(unreadable, classOf, roots);
  assert.ok(missing.errors.some(e => e.address === listener), 'unreadable linked objects reported');
  assert.ok(!missing.objects.some(o => o.address === listener));
  pointer(entity + 0x30, base + 0x6200);
  const stale = captureEffects(proc, classOf, roots);
  assert.equal(stale.objects.length, 0, 'stale owners never supply effect samples');
  assert.ok(stale.errors.length > 0);
  console.log('test-talent-rarity-probe: passed');
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
