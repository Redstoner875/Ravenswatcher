'use strict';
// Compare a normal in-game upgrade before introducing writes. The persisted
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

function compare(before, after) {
  const identity = o => JSON.stringify([o.kind, o.address, o.controller, o.entity,
    o.context, o.definition, o.record, o.hero, o.guid, o.key]);
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
        before_i32: a.readInt32LE(offset), after_i32: b.readInt32LE(offset) });
    }
    if (words.length) changes.push({ kind: current.kind, address: current.address,
      hero: current.hero, guid: current.guid, key: current.key, state: 'changed', words });
  }
  for (const object of old.values()) changes.push({ ...object, state: 'removed' });
  return changes;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('npm run probe:talents -- [output.jsonl]\n'
      + 'Windows, running game, solo run. Enter captures; q exits.\n'
      + 'Capture twice while idle, upgrade one talent normally, then capture again.\n'
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
  const output = path.resolve(process.argv[2] || 'talent-rarity-capture.jsonl');
  const pid = win32.findPid(PROCESS_NAME);
  const mod = win32.moduleBase(pid);
  const proc = win32.openProcess(pid);
  let fd;
  let input;
  try {
    fd = fs.openSync(output, 'wx');
    const write = data => fs.writeSync(fd, JSON.stringify(data) + '\n');
    write({ type: 'session', version: 1, pid, module_base: mod.base,
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
    const classOf = address => byVtable.get(proc.readPtr(address)) ?? null;
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
module.exports = { capture, compare };
