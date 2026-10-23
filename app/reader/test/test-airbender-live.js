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
  const resolve = () => live.selectorLayout(proc, classOf, target());
  assert.equal(resolve().selected, cases + 2 * 0x38);
  assert.equal(live.apply, undefined, 'the disproven raw cache writer is removed');
  ptr(selector + 0x80, cases + 1);
  assert.throws(resolve, /outside/);
  reset();
  classes.set(selector + 0x88, '.?AVFixtureUnexpectedValue@@');
  const diagnosticBefore = Buffer.from(bytes);
  const diagnosis = live.diagnose(proc, classOf, target());
  assert.equal(diagnosis.read_only, true);
  assert.equal(diagnosis.actual_count_class, '.?AVFixtureUnexpectedValue@@');
  assert.equal(diagnosis.expected_count_class, live.VALUE_UNION_CLASS);
  assert.equal(diagnosis.nodes.filter(n => n.offset.startsWith('case[')).length, 4,
    'targeted captures include every case even when the count class is unsupported');
  assert.ok(diagnosis.nodes.some(n => n.address === countPointer), 'untyped boxed payloads are included');
  assert.ok(diagnosis.nodes.find(n => n.address === selector).embedded.some(e => e.offset === '0x88'));
  assert.deepEqual(bytes, diagnosticBefore, 'diagnosis never changes game bytes');
  assert.equal(live.inspect, undefined, 'no obsolete count interpretation remains');
  classes.delete(selector);
  assert.throws(resolve, /exactly one owned/);
  console.log('test-airbender-live: passed');
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
