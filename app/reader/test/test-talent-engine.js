'use strict';
const assert = require('assert/strict');
const engine = require('../bench/talent-engine');
function main() {
  const moduleBase = 0x10000000, data = Buffer.alloc(0x300000), heap = Buffer.alloc(0x10000), base = 0x20000000;
  const t = { runtime: base, controller: base + 0x1000, definition: base + 0x4000,
    entity: base + 0x6000, context: base + 0x7000, address: base + 0x5000, current: 0, guid: 'ab'.repeat(16) };
  const writePtr = (at, n) => heap.writeBigUInt64LE(BigInt(n), at - base);
  writePtr(t.runtime, moduleBase + 0x1000); writePtr(t.controller, moduleBase + 0x2000);
  writePtr(t.definition, moduleBase + 0x3000); writePtr(t.runtime + 0x68, t.address);
  writePtr(t.runtime + 0x78, t.controller); writePtr(t.controller + 0x1008, t.runtime);
  engine.SETTER_START.copy(data, engine.SETTER_RVA); engine.SETTER_END.copy(data, 0x2E88D9);
  const proc = { read(at, size) {
    const bytes = at >= base ? heap : data, start = at - (at >= base ? base : moduleBase);
    return start >= 0 && start + size <= bytes.length ? Buffer.from(bytes.subarray(start, start + size)) : null;
  } };
  const mod = { base: moduleBase }, before = Buffer.from(heap);
  const target = engine.inspect(proc, mod, t);
  assert.deepEqual(heap, before, 'preview is read-only');
  assert.equal(engine.requestArgs(100, mod, target, 3).length, 14);
  assert.equal(engine.requestArgs(100, mod, target, 3).at(-1), t.guid);
  assert.throws(() => engine.requestArgs(100, mod, target, 4), /Invalid/);
  assert.throws(() => engine.requestArgs(100, mod, { ...target, runtime: NaN }, 3), /Invalid/);
  data[engine.SETTER_RVA] ^= 1;
  assert.throws(() => engine.inspect(proc, mod, t), /signature/);
  data[engine.SETTER_RVA] ^= 1;
  writePtr(t.runtime + 0x68, t.address + 4);
  assert.throws(() => engine.inspect(proc, mod, t), /backing/);
  writePtr(t.runtime + 0x68, t.address); writePtr(t.controller + 0x1008, 0);
  assert.throws(() => engine.inspect(proc, mod, t), /selected slots/);
  assert.throws(() => engine.apply(() => ({ ...target, current: 1 }), 100, mod, target, 3), /changed since preview/);
  console.log('test-talent-engine: passed'); return 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { main };
