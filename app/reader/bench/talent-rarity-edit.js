'use strict';
// Experimental source-only writer. Field evidence: the 2026-10-23 Wukong
// Thirst for Immortality capture changed persistent +0x50 from 0 to 1.
// Gameplay recalculation after a direct write is NOT yet established.
const { RUN_CLASSES: C, vectorAt } = require('../runs');
const { capture } = require('./talent-rarity-watch');
const GUID = '717e49d62fdb8d4bad49eb879056b1e4';
const BUILD = 'b9c3642884a8f3a463782f36c9a3a62bc14c88105315220c733fe6c2229ba904';
const RARITIES = { common: 0, rare: 1, epic: 2, legendary: 3 };

function pointer(proc, at) {
  const b = proc.read(at, 8);
  if (!b || b.length !== 8) throw new Error('Unreadable pointer.');
  const value = Number(b.readBigUInt64LE());
  if (!Number.isSafeInteger(value) || value < 0x10000) throw new Error('Invalid pointer.');
  return value;
}

function selected(proc, classOf, record, guid) {
  const entries = vectorAt(proc, record + 0x10, 512);
  const heroes = [];
  for (let i = 0; i < entries.count; i++) {
    const entry = pointer(proc, entries.ptr + i * 8);
    if (classOf(entry) === C.hero) heroes.push(entry);
  }
  if (heroes.length !== 1) throw new Error('Selected talent owner unavailable or ambiguous.');
  const chosen = vectorAt(proc, heroes[0] + 0xE8, 128);
  let matches = 0;
  for (let i = 0; i < chosen.count; i++) {
    const bytes = proc.read(chosen.ptr + i * 16, 16);
    if (!bytes || bytes.length !== 16) throw new Error('Selected talents unreadable.');
    if (bytes.toString('hex') === guid) matches++;
  }
  return matches === 1;
}

function locate(proc, classOf, found) {
  const snapshot = capture(proc, classOf, found);
  const runtimes = snapshot.objects.filter(o => o.kind === 'runtime' && o.guid === GUID);
  const persistent = snapshot.objects.filter(o => o.kind === 'persistent' && o.guid === GUID);
  if (runtimes.length !== 1 || persistent.length !== 1) throw new Error('Expected one live Thirst for Immortality and one persistent entry.');
  const runtime = runtimes[0], entry = persistent[0];
  if (runtime.hero !== entry.hero || !/^Hero_SunWukong_/.test(runtime.hero)) throw new Error('Hero identity mismatch.');
  if (!selected(proc, classOf, entry.record, GUID)) throw new Error('Thirst for Immortality is not selected in this run.');
  if (!Number.isInteger(entry.rarity_code) || entry.rarity_code < 0 || entry.rarity_code > 3) throw new Error('Unsupported current rarity.');
  return { address: entry.address + 0x50, record: entry.record, runtime: runtime.address,
    controller: runtime.controller, entity: runtime.entity, context: runtime.context,
    definition: runtime.definition, hero: runtime.hero, current: entry.rarity_code, guid: GUID };
}

function applyChange(resolve, write, target, rarity) {
  if (!Number.isInteger(rarity) || rarity < 0 || rarity > 3) throw new Error('Unsupported target rarity.');
  const fresh = resolve();
  if (JSON.stringify(fresh) !== JSON.stringify(target)) throw new Error('Talent changed since preview; nothing written.');
  if (fresh.current === rarity) return { changed: false, current: rarity };
  const payload = Buffer.alloc(4);
  payload.writeInt32LE(rarity);
  if (write(fresh.address, payload) !== 4) throw new Error('Write failed or was incomplete; inspect the game before retrying.');
  const after = resolve();
  if (JSON.stringify({ ...after, current: fresh.current }) !== JSON.stringify(fresh) || after.current !== rarity) {
    throw new Error('Write could not be verified. Gameplay effect remains unknown.');
  }
  return { changed: true, previous: fresh.current, current: after.current };
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('npm run edit:talents -- thirst <common|rare|epic|legendary> [--apply]\n'
      + 'Preview by default. --apply writes only the selected talent\'s persistent rarity.\n'
      + 'Experimental: actual gameplay effects and tooltip recalculation are unverified.\n'
      + 'Requires the captured Windows game build and an active solo Wukong run.');
    return;
  }
  if (args[0] !== 'thirst' || !Object.hasOwn(RARITIES, args[1])
    || args.slice(2).some(a => a !== '--apply') || args.length > 3) throw new Error('Invalid arguments; use --help.');
  if (process.platform !== 'win32') throw new Error('Live editing requires Windows.');
  const fs = require('fs');
  const crypto = require('crypto');
  const win32 = require('../win32');
  const rtti = require('../rtti');
  const { scanPointers } = require('../scan');
  const values = require('../values');
  const { PROCESS_NAME, CURRENT_MAP_ID, GAME_SESSION_SIZE } = require('../state');
  const pid = win32.findPid(PROCESS_NAME);
  const mod = win32.moduleBase(pid);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(mod.exePath)).digest('hex');
  if (hash !== BUILD) throw new Error('Game executable differs from the measured build; a new capture is required.');
  const proc = win32.openProcess(pid);
  let writeHandle = null;
  let closeWrite;
  try {
    const byVtable = new Map();
    for (const name of Object.values(C)) {
      for (const rva of rtti.resolveAllVtableRvas(proc, mod.base, name + '\0')) byVtable.set(mod.base + rva, name);
    }
    const classOf = at => byVtable.get(proc.readPtr(at)) ?? null;
    const wanted = new Set([C.controller, C.settings, C.runtime, C.record]);
    const targets = [...byVtable].filter(([, name]) => wanted.has(name)).map(([vt]) => vt);
    const hits = scanPointers(proc, targets, { writableOnly: true });
    const addresses = name => [...byVtable].filter(([, n]) => n === name).flatMap(([vt]) => hits.get(vt) ?? []);
    const found = { controllers: addresses(C.controller), settings: addresses(C.settings),
      runtimes: addresses(C.runtime), records: addresses(C.record) };
    const index = values.buildIndex(proc, mod.base);
    const resolve = () => {
      if (!proc.isAlive()) throw new Error('Game exited.');
      const map = index?.resolve(CURRENT_MAP_ID), session = index?.resolve(GAME_SESSION_SIZE);
      if (map?.status !== 'ok' || map.value < 0 || session?.status !== 'ok' || session.value !== 1) {
        throw new Error('An active solo run could not be verified.');
      }
      return locate(proc, classOf, found);
    };
    const target = resolve();
    const rarity = RARITIES[args[1]];
    console.log(`Thirst for Immortality: ${target.current} -> ${rarity} (${args[1]}).`);
    if (!args.includes('--apply')) {
      console.log('Preview only. Add --apply to test the persistent rarity change.');
      return;
    }
    // Separate short-lived handle. Normal app readers retain their fixed read-only mask.
    const { koffi } = win32;
    const k32 = koffi.load('kernel32.dll');
    const open = k32.func('__stdcall', 'OpenProcess', 'void *', ['uint32', 'bool', 'uint32']);
    closeWrite = k32.func('__stdcall', 'CloseHandle', 'bool', ['void *']);
    const writeMemory = k32.func('__stdcall', 'WriteProcessMemory', 'bool',
      ['void *', 'size_t', 'void *', 'size_t', koffi.out(koffi.pointer('size_t'))]);
    writeHandle = open(0x0438, false, pid); // query + read + write + operation, no injection rights
    if (!writeHandle) throw new Error('Could not open the experimental write handle.');
    const result = applyChange(resolve, (at, payload) => {
      const written = [0];
      return writeMemory(writeHandle, at, payload, payload.length, written) ? written[0] : 0;
    }, target, rarity);
    console.log(JSON.stringify(result));
    console.log('Persistent rarity verified. Reopen the talent tooltip and check its numbers and actual effect.');
    console.log('This does not establish live effect recalculation or saving across chapter transitions.');
  } finally {
    if (writeHandle && closeWrite) closeWrite(writeHandle);
    proc.close();
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { locate, selected, applyChange };
