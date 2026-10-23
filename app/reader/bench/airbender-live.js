'use strict';
// Read-only Airbender diagnostics. Executable analysis disproved the former
// boxed-count writer. +0x88 is a value-union signal, not a numeric count.
// 2026-10-23 normal Common -> Rare capture:
// the named selector's +0x70 vector has four entries; +0x80 changed from
// vector+0xA8 to vector+0x70 (one 0x38-byte entry backwards). Epic/Legendary
// continue that descending order as a hypothesis, not live-verified behavior.
const { vectorAt, stringAt } = require('../runs');
const AIRBENDER_GUID = '4e07fac065253a46a7418d70654504f2';
const SELECTOR_CLASS = '.?AVoCEntityCpntValueSelector@@';
const VALUE_UNION_CLASS = '.?AVoCEntityValueUnion@@';
const SELECTOR_NAME = 'Skill Power Extra Targets Count Selector';
const STRIDE = 0x38;

function exact(proc, at, size) {
  const bytes = proc.read(at, size);
  if (!bytes || bytes.length !== size) throw new Error('Live selector memory unavailable.');
  return bytes;
}

function pointer(proc, at) {
  const value = Number(exact(proc, at, 8).readBigUInt64LE());
  if (!Number.isSafeInteger(value) || value < 0x10000) throw new Error('Invalid live selector pointer.');
  return value;
}

function selectorLayout(proc, classOf, target) {
  if (target.guid !== AIRBENDER_GUID || !/^Hero_SunWukong_/.test(target.hero)) {
    throw new Error('The live selector experiment supports Wukong Airbender only.');
  }
  const components = vectorAt(proc, target.entity + 0x190, 10000);
  const matches = new Set();
  for (let i = 0; i < components.count; i++) {
    const address = pointer(proc, components.ptr + i * 8);
    if (classOf(address) !== SELECTOR_CLASS || pointer(proc, address + 8) !== target.entity) continue;
    const settings = pointer(proc, address + 0x10);
    if (stringAt(proc, settings + 0xE8, 256) === SELECTOR_NAME) matches.add(address);
  }
  if (matches.size !== 1) throw new Error('Expected exactly one owned Airbender count selector.');
  const selector = [...matches][0];
  const entries = vectorAt(proc, selector + 0x70, 4);
  if (entries.count !== 4 || entries.capacity !== 4) throw new Error('Live selector table differs from the captured layout.');
  const selected = pointer(proc, selector + 0x80);
  const index = (selected - entries.ptr) / STRIDE;
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Live selector points outside its four-case table.');
  return { ...target, selector, selectorSettings: pointer(proc, selector + 0x10),
    cases: entries.ptr, casesRaw: exact(proc, entries.ptr, 4 * STRIDE).toString('hex'), selected };
}

// Targeted readout after a layout refusal. Include untyped boxed payloads and
// the four case records, which the broad capture's root budget missed. This
// function never relaxes the writer's class check and has no write callback.
function diagnose(proc, classOf, target, moduleRange = null) {
  const layout = selectorLayout(proc, classOf, target);
  const queue = [], seen = new Set(), nodes = [], errors = [];
  let truncated = false;
  const blocked = new Set([target.entity, target.context, target.controller, target.definition, layout.selectorSettings]);
  const enqueue = (address, depth, parent, offset, size = 0x100) => {
    if (!Number.isSafeInteger(address) || address < 0x10000 || address > 0x7FFFFFFFFFFF
      || blocked.has(address) || seen.has(address)) return;
    if (moduleRange && address >= moduleRange.base && address < moduleRange.base + moduleRange.size) return;
    if (seen.size >= 256) { truncated = true; return; }
    seen.add(address); queue.push({ address, depth, parent, offset, size });
  };
  enqueue(layout.selector, 0, null, 'selector', 0xE8);
  enqueue(target.runtime, 0, null, 'skill-runtime', 0x200);
  for (let i = 0; i < 4; i++) enqueue(layout.cases + i * STRIDE, 0, layout.selector, `case[${i}]`, STRIDE);
  const safeClass = address => {
    try { return classOf(address); } catch { return null; }
  };
  for (let i = 0; i < queue.length; i++) {
    const request = queue[i];
    const raw = proc.read(request.address, request.size);
    if (!raw || raw.length !== request.size) {
      errors.push({ address: request.address, message: 'incomplete diagnostic read', bytes: raw?.length ?? 0 });
      continue;
    }
    const embedded = [];
    for (let offset = 0; offset + 8 <= raw.length; offset += 8) {
      const cls = safeClass(request.address + offset);
      if (cls) embedded.push({ offset: '0x' + offset.toString(16), class_name: cls });
    }
    nodes.push({ ...request, class_name: safeClass(request.address), embedded, raw: raw.toString('hex') });
    if (request.depth >= 2) continue;
    for (let offset = 0; offset + 8 <= raw.length; offset += 8) {
      enqueue(Number(raw.readBigUInt64LE(offset)), request.depth + 1, request.address, '0x' + offset.toString(16));
    }
  }
  return { version: 2, at: new Date().toISOString(), read_only: true,
    layout, selector_signal_class: safeClass(layout.selector + 0x88),
    selector_value_class: safeClass(layout.selector + 0xB0), nodes, errors, truncated };
}

module.exports = { AIRBENDER_GUID, SELECTOR_CLASS, VALUE_UNION_CLASS, selectorLayout, diagnose };
