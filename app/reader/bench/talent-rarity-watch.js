'use strict';
// Compare a normal in-game upgrade with stored-only edits. The persisted
// +0x50 code is known from runs.readTalents; no runtime rarity offset is known.
// Raw windows are exploratory bytes, not claims about field types or sizes.
const { RUN_CLASSES: C, stringAt, vectorAt, readTalents } = require('../runs');

function exact(proc, address, size) {
  const bytes = proc.read(address, size);
  if (!bytes || bytes.length !== size) throw new Error('incomplete memory read');
  return bytes;
}

function ptr(proc, address) {
  const value = Number(exact(proc, address, 8).readBigUInt64LE());
  if (!Number.isSafeInteger(value) || value < 0x10000) throw new Error('invalid pointer');
  return value;
}

function capture(proc, classOf, found) {
  const objects = [];
  const errors = [];
  const add = (kind, address, size, identity) => {
    objects.push({ kind, address, ...identity, raw: exact(proc, address, size).toString('hex') });
  };
  for (const controller of new Set(found.controllers)) {
    try {
      if (classOf(controller) !== C.controller) continue;
      const entity = ptr(proc, controller + 8);
      const context = ptr(proc, entity + 0x30);
      const hero = stringAt(proc, ptr(proc, entity + 0x28) + 8, 256);
      if (!/^Hero_[A-Za-z0-9_]+$/.test(hero)) continue;
      const components = vectorAt(proc, entity + 0x190, 10000);
      for (let i = 0; i < components.count; i++) {
        const runtime = ptr(proc, components.ptr + i * 8);
        if (classOf(runtime) !== C.runtime || ptr(proc, runtime + 8) !== entity) continue;
        const definition = ptr(proc, runtime + 0x10);
        if (classOf(definition) !== C.settings || ptr(proc, definition + 0x18) !== definition) continue;
        const key = stringAt(proc, definition + 0xE8, 256);
        const guid = exact(proc, definition + 0x88, 16).toString('hex');
        add('runtime', runtime, 0x200, { controller, entity, context, definition, hero, key, guid });
      }
      if (ptr(proc, controller + 8) !== entity || ptr(proc, entity + 0x30) !== context) {
        throw new Error('hero changed during capture');
      }
    } catch (e) {
      // Discard the partial owner rather than treating it as a coherent sample.
      for (let i = objects.length - 1; i >= 0; i--) {
        if (objects[i].controller === controller) objects.splice(i, 1);
      }
      errors.push({ controller, message: e.message });
    }
  }
  const records = [];
  for (const record of new Set(found.records)) {
    try {
      if (classOf(record) !== C.record) continue;
      const hero = stringAt(proc, ptr(proc, record + 0x20) + 8, 256);
      const persistent = vectorAt(proc, record + 0x10, 512);
      const pending = [];
      for (let i = 0; i < persistent.count; i++) {
        const entry = ptr(proc, persistent.ptr + i * 8);
        if (classOf(entry) !== C.skill) continue;
        const raw = exact(proc, entry, 0x58);
        pending.push({ kind: 'persistent', address: entry, record, hero,
          guid: raw.subarray(0x20, 0x30).toString('hex'),
          rarity_code: raw.readInt32LE(0x50), raw: raw.toString('hex') });
      }
      objects.push(...pending);
      let talents = null;
      let talentError = null;
      try { talents = readTalents(proc, record, classOf, found.settings, found.runtimes); }
      catch (e) { talentError = e.message; }
      records.push({ record, hero, talents, talentError });
    } catch (e) { errors.push({ record, message: e.message }); }
  }
  return { at: new Date().toISOString(), objects, records, errors };
}

// Effect caches may live in other hero components or linked value listeners,
// rather than the skill controller itself. Explore two pointer hops, bounded
// by RTTI, ownership, depth and a node budget; no discovered bytes are written.
function captureEffects(proc, classOf, runtimes, limit = 2048) {
  const objects = [], errors = [];
  let truncated = false;
  const owners = new Map(runtimes.filter(o => o.kind === 'runtime').map(o => [o.controller, o]));
  for (const owner of owners.values()) {
    const identity = { controller: owner.controller, entity: owner.entity, context: owner.context, hero: owner.hero };
    try {
      if (classOf(owner.controller) !== C.controller || ptr(proc, owner.controller + 8) !== owner.entity
        || ptr(proc, owner.entity + 0x30) !== owner.context) throw new Error('stale effect owner');
      const components = vectorAt(proc, owner.entity + 0x190, 10000);
      const pending = [], seen = new Set();
      const enqueue = (address, depth, parent, via) => {
        if (seen.has(address)) return;
        const cls = classOf(address);
        if (!cls || cls === C.entity || /Settings@@$|ProfileData@@$/.test(cls)) return;
        if (seen.size >= limit) { truncated = true; return; }
        seen.add(address);
        pending.push({ address, depth, parent, via, class_name: cls });
      };
      // Prioritize skills before other owned components if the budget is reached.
      for (const rt of runtimes.filter(o => o.kind === 'runtime' && o.controller === owner.controller)) {
        enqueue(rt.address, 0, owner.entity, 'skill');
      }
      for (let i = 0; i < components.count; i++) {
        try {
          const component = ptr(proc, components.ptr + i * 8);
          if (ptr(proc, component + 8) === owner.entity) enqueue(component, 0, owner.entity, `component[${i}]`);
        } catch { /* An empty or unreadable component slot is not a root. */ }
      }
      for (let i = 0; i < pending.length; i++) {
        const node = pending[i];
        try {
          const raw = exact(proc, node.address, 0x200);
          if (classOf(node.address) !== node.class_name) throw new Error('object class changed');
          let key = null;
          if (node.depth === 0) {
            try { key = stringAt(proc, ptr(proc, node.address + 0x10) + 0xE8, 256); } catch { /* optional label */ }
          }
          objects.push({ kind: 'effect', ...identity, ...node, key, raw: raw.toString('hex') });
          if (node.depth >= 2) continue;
          for (let offset = 8; offset + 8 <= raw.length; offset += 8) {
            const address = Number(raw.readBigUInt64LE(offset));
            if (!Number.isSafeInteger(address) || address < 0x10000 || address > 0x7FFFFFFFFFFF
              || address === owner.entity || address === owner.context || address === owner.controller) continue;
            enqueue(address, node.depth + 1, node.address, '0x' + offset.toString(16));
          }
        } catch (e) { errors.push({ ...identity, address: node.address, message: e.message }); }
      }
      if (ptr(proc, owner.controller + 8) !== owner.entity || ptr(proc, owner.entity + 0x30) !== owner.context) {
        throw new Error('effect owner changed during capture');
      }
    } catch (e) {
      for (let i = objects.length - 1; i >= 0; i--) {
        if (objects[i].controller === owner.controller) objects.splice(i, 1);
      }
      errors.push({ ...identity, message: e.message });
    }
  }
  return { objects, errors, truncated };
}

function compare(before, after) {
  const identity = o => JSON.stringify([o.kind, o.address, o.controller, o.entity,
    o.context, o.definition, o.record, o.hero, o.guid, o.key, o.class_name]);
  const old = new Map(before.objects.map(o => [identity(o), o]));
  const changes = [];
  for (const current of after.objects) {
    const previous = old.get(identity(current));
    if (!previous) { changes.push({ ...current, state: 'added' }); continue; }
    old.delete(identity(current));
    const a = Buffer.from(previous.raw, 'hex');
    const b = Buffer.from(current.raw, 'hex');
    if (a.length !== b.length) throw new Error('capture window size changed');
    const words = [];
    for (let offset = 0; offset + 4 <= a.length; offset += 4) {
      if (a.subarray(offset, offset + 4).equals(b.subarray(offset, offset + 4))) continue;
      words.push({ offset: '0x' + offset.toString(16),
        before: a.subarray(offset, offset + 4).toString('hex'),
        after: b.subarray(offset, offset + 4).toString('hex'),
        before_i32: a.readInt32LE(offset), after_i32: b.readInt32LE(offset),
        before_f32: a.readFloatLE(offset), after_f32: b.readFloatLE(offset) });
    }
    if (words.length) changes.push({ kind: current.kind, address: current.address,
      hero: current.hero, guid: current.guid, key: current.key, class_name: current.class_name, state: 'changed', words });
  }
  for (const object of old.values()) changes.push({ ...object, state: 'removed' });
  return changes;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('npm run probe:talents -- [output.jsonl] [--deep]\n'
      + 'Windows, running game, solo run. Enter captures; q exits.\n'
      + 'Capture twice while idle, upgrade one talent normally, then capture again.\n'
      + '--deep includes owned hero components and RTTI-linked value objects.\n'
      + 'This records evidence only; it does not change talents.');
    return;
  }
  if (process.platform !== 'win32') throw new Error('Live capture requires Windows.');
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const readline = require('readline');
  const win32 = require('../win32');
  const rtti = require('../rtti');
  const { scanPointers } = require('../scan');
  const { PROCESS_NAME } = require('../state');
  const args = process.argv.slice(2);
  const filenames = args.filter(arg => !arg.startsWith('--'));
  if (filenames.length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--deep')) throw new Error('Invalid arguments; use --help.');
  const deep = args.includes('--deep');
  const output = path.resolve(filenames[0] || 'talent-rarity-capture.jsonl');
  const pid = win32.findPid(PROCESS_NAME);
  const mod = win32.moduleBase(pid);
  const proc = win32.openProcess(pid);
  let fd;
  let input;
  try {
    fd = fs.openSync(output, 'wx');
    const write = data => fs.writeSync(fd, JSON.stringify(data) + '\n');
    write({ type: 'session', version: 2, deep, pid, module_base: mod.base,
      module_size: mod.size, exe_sha256: crypto.createHash('sha256').update(fs.readFileSync(mod.exePath)).digest('hex'),
      note: 'Raw runtime windows include untyped bytes. Changes alone do not prove a rarity field.' });
    console.log('Resolving talent classes...');
    const byVtable = new Map();
    for (const name of Object.values(C)) {
      for (const rva of rtti.resolveAllVtableRvas(proc, mod.base, name + '\0')) byVtable.set(mod.base + rva, name);
    }
    for (const name of [C.controller, C.settings, C.runtime, C.skill, C.record]) {
      if (![...byVtable.values()].includes(name)) throw new Error('Required class unavailable: ' + name);
    }
    const classCache = new Map(byVtable);
    const classOf = address => {
      const vt = proc.readPtr(address);
      if (vt === null) return null;
      if (!classCache.has(vt)) classCache.set(vt, rtti.classOfVtable(proc, mod.base, mod.size, vt));
      return classCache.get(vt) ?? null;
    };
    const wanted = new Set([C.controller, C.settings, C.runtime, C.record]);
    const targets = [...byVtable].filter(([, name]) => wanted.has(name)).map(([vt]) => vt);
    console.log('Solo run: capture twice while idle, upgrade ONE talent normally, capture again.');
    console.log('Enter a label (e.g. before, idle, after-dash-rare) to capture. q exits.');
    console.log('Output: ' + output);
    input = readline.createInterface({ input: process.stdin, output: process.stdout });
    let previous = null;
    for await (const label of input) {
      if (label.trim().toLowerCase() === 'q') break;
      if (!proc.isAlive()) throw new Error('Game exited; start a new capture session.');
      const hits = scanPointers(proc, targets, { writableOnly: true });
      const addresses = name => [...byVtable].filter(([, n]) => n === name).flatMap(([vt]) => hits.get(vt) ?? []);
      const snapshot = capture(proc, classOf, { controllers: addresses(C.controller),
        settings: addresses(C.settings), runtimes: addresses(C.runtime), records: addresses(C.record) });
      if (deep) {
        const effects = captureEffects(proc, classOf, snapshot.objects);
        snapshot.objects.push(...effects.objects);
        snapshot.errors.push(...effects.errors);
        snapshot.effects_truncated = effects.truncated;
        console.log(`${effects.objects.length} effect objects; truncated=${effects.truncated}.`);
      }
      const changes = previous ? compare(previous, snapshot) : null;
      write({ type: 'capture', label: label.trim(), snapshot, changes });
      const runtimeCount = snapshot.objects.filter(o => o.kind === 'runtime').length;
      console.log(`${runtimeCount} live skills; ${snapshot.records.length} records; ${snapshot.errors.length} read errors.`);
      for (const record of snapshot.records) console.log(JSON.stringify({ hero: record.hero, talents: record.talents, error: record.talentError }));
      for (const change of changes ?? []) {
        if (change.state === 'changed') console.log(JSON.stringify(change));
      }
      if (!runtimeCount) console.log('No live skills captured. Enter an active solo run and retry.');
      previous = snapshot;
    }
  } finally {
    if (input) input.close();
    if (fd !== undefined) fs.closeSync(fd);
    proc.close();
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { capture, compare, captureEffects };
