'use strict';
const assert = require('assert/strict');
const live = require('../bench/airbender-live');

function main() {
  const base = 0x10000, bytes = Buffer.alloc(0x10000);
  const entity = base, components = base + 0x1000, selector = base + 0x2000;
  const settings = base + 0x3000, cases = base + 0x4000, stored = base + 0x5000;
  const countPointer = base + 0x8000;
  const ptr = (at, value) => bytes.writeBigUInt64LE(BigInt(value), at - base);
  const int = (at, value) => bytes.writeInt32LE(value, at - base);
  const vec = (at, value, count) => { ptr(at, value); int(at + 8, count); int(at + 12, count); };
  vec(entity + 0x190, components, 1); ptr(components, selector);
  ptr(selector + 8, entity); ptr(selector + 0x10, settings);
  const name = 'Skill Power Extra Targets Count Selector';
  vec(settings + 0xE8, base + 0x6000, name.length); bytes.write(name, 0x6000);
  vec(selector + 0x70, cases, 4);
  ptr(selector + 0x90, countPointer);
  bytes.fill(0xAB, cases - base, cases - base + 4 * 0x38);
  const reset = (rarity = 1, index = 2) => {
    int(stored, rarity); ptr(selector + 0x80, cases + index * 0x38); int(countPointer, 4 - index);
  };
  reset();
  const proc = { read(at, size) {
    return at >= base && at + size <= base + bytes.length
      ? Buffer.from(bytes.subarray(at - base, at - base + size)) : null;
  } };
  const classes = new Map([[selector, live.SELECTOR_CLASS], [selector + 0x88, live.VALUE_UNION_CLASS]]);
  const classOf = at => classes.get(at) ?? null;
  const target = () => ({ guid: live.AIRBENDER_GUID, hero: 'Hero_SunWukong_Default',
    entity, address: stored, current: bytes.readInt32LE(stored - base) });
  const resolve = () => live.inspect(proc, classOf, target());
  let writes = [];
  const write = (at, payload) => { writes.push([at, payload.length]); payload.copy(bytes, at - base); return payload.length; };
  const preview = resolve(), before = Buffer.from(bytes);
  const result = live.apply(resolve, write, preview, 3);
  assert.deepEqual(writes, [[stored, 4], [selector + 0x80, 8], [countPointer, 4]]);
  const expected = Buffer.from(before);
  expected.writeInt32LE(3, stored - base); expected.writeBigUInt64LE(BigInt(cases), selector - base + 0x80);
  expected.writeInt32LE(4, countPointer - base);
  assert.deepEqual(bytes, expected, 'writes stored rarity, selected case and guarded count; no table edits');
  assert.equal(result.selected_case, 0);
  assert.equal(result.gameplay_verified, false, 'readback never claims gameplay verification');
  writes = [];
  assert.equal(live.apply(resolve, write, resolve(), 3).changed, false);
  assert.equal(writes.length, 0);
  reset(3, 2);
  live.apply(resolve, write, resolve(), 3);
  assert.deepEqual(writes, [[selector + 0x80, 8], [countPointer, 4]], 'repairs a stored-only rarity without an unnecessary stored write');
  reset(); writes = [];
  assert.throws(() => live.apply(resolve, write, preview, 4), /Unsupported/);
  const old = resolve(); bytes[cases - base] = 0xAC;
  assert.throws(() => live.apply(resolve, write, old, 3), /changed since preview/);
  assert.equal(writes.length, 0);
  const failed = resolve();
  assert.throws(() => live.apply(resolve, () => 0, failed, 3), /Partial changes may remain/);
  let attempts = 0;
  assert.throws(() => live.apply(resolve, (at, payload) => {
    attempts++;
    if (attempts === 2) return 0;
    return write(at, payload);
  }, resolve(), 3), /Partial changes may remain/);
  assert.equal(attempts, 2);
  reset();
  assert.throws(() => live.apply(resolve, () => 4, resolve(), 3), /readback failed/);
  ptr(selector + 0x80, cases + 1);
  assert.throws(resolve, /outside/);
  reset(); vec(selector + 0x70, cases, 3);
  assert.throws(resolve, /differs/);
  vec(selector + 0x70, cases, 4);
  int(countPointer, 99);
  assert.throws(resolve, /not a supported/);
  reset(); int(countPointer, 1);
  assert.throws(() => live.apply(resolve, write, resolve(), 3), /disagrees/);
  reset(); ptr(selector + 0x90, cases);
  assert.throws(resolve, /aliases/);
  ptr(selector + 0x90, countPointer);
  classes.delete(selector + 0x88);
  assert.throws(resolve, /union class/);
  classes.set(selector + 0x88, live.VALUE_UNION_CLASS);
  ptr(selector + 8, base + 0x7000);
  assert.throws(resolve, /exactly one owned/);
  ptr(selector + 8, entity);
  assert.throws(() => live.inspect(proc, classOf, { ...target(), guid: 'aa'.repeat(16) }), /Airbender only/);
  classes.delete(selector);
  assert.throws(resolve, /exactly one owned/);
  console.log('test-airbender-live: passed');
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
