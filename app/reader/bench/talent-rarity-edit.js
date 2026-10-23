'use strict';
// Experimental source-only writer. The 2026-10-23 Thirst capture measured
// persistent +0x50; a direct Rare-to-Epic write updated its tooltip and bonus.
// Airbender testing confirmed the stored-only write does not upgrade its effect.
const { RUN_CLASSES: C, RARITY, vectorAt, readTalentName } = require('../runs');
const { capture } = require('./talent-rarity-watch');
const airbender = require('./airbender-live');
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

function chosenGuids(proc, classOf, record) {
  const entries = vectorAt(proc, record + 0x10, 512);
  const heroes = [];
  for (let i = 0; i < entries.count; i++) {
    const entry = pointer(proc, entries.ptr + i * 8);
    if (classOf(entry) === C.hero) heroes.push(entry);
  }
  if (heroes.length !== 1) throw new Error('Selected talent owner unavailable or ambiguous.');
  const chosen = vectorAt(proc, heroes[0] + 0xE8, 128);
  const guids = [];
  for (let i = 0; i < chosen.count; i++) {
    const bytes = proc.read(chosen.ptr + i * 16, 16);
    if (!bytes || bytes.length !== 16) throw new Error('Selected talents unreadable.');
    guids.push(bytes.toString('hex'));
  }
  if (new Set(guids).size !== guids.length) throw new Error('Duplicate selected talent GUID.');
  return guids;
}

function selected(proc, classOf, record, guid) {
  return chosenGuids(proc, classOf, record).includes(guid);
}

function listTalents(proc, classOf, found) {
  const snapshot = capture(proc, classOf, found);
  if (snapshot.records.length !== 1) throw new Error('Expected one current run record.');
  const record = snapshot.records[0];
  return chosenGuids(proc, classOf, record.record).map(guid => {
    const runtimes = snapshot.objects.filter(o => o.kind === 'runtime' && o.guid === guid);
    const persistent = snapshot.objects.filter(o => o.kind === 'persistent' && o.guid === guid);
    if (runtimes.length !== 1 || persistent.length !== 1) {
      throw new Error(`Expected one live talent and one persistent entry for ${guid}.`);
    }
    const runtime = runtimes[0], entry = persistent[0];
    if (runtime.hero !== entry.hero || runtime.hero !== record.hero) throw new Error('Hero identity mismatch.');
    let name = runtime.key, nameSource = 'internal';
    try {
      name = readTalentName(proc, runtime.definition, classOf, [runtime.address]);
      nameSource = 'localized';
    } catch { /* Keep GUID/internal-key access when localization is unavailable. */ }
    const editable = Number.isInteger(entry.rarity_code) && entry.rarity_code >= 0 && entry.rarity_code <= 3;
    return { address: entry.address + 0x50, record: entry.record, runtime: runtime.address,
      controller: runtime.controller, entity: runtime.entity, context: runtime.context,
      definition: runtime.definition, hero: runtime.hero, current: entry.rarity_code, guid,
      name, nameSource, key: runtime.key, rarity: RARITY[entry.rarity_code] ?? 'Unknown', editable };
  });
}

function chooseTalent(talents, selector) {
  const query = selector.trim().toLowerCase();
  const guid = query === 'thirst' ? GUID : query;
  const byGuid = talents.filter(t => t.guid === guid);
  const matches = byGuid.length ? byGuid : talents.filter(t => t.name.toLowerCase() === query || t.key.toLowerCase() === query);
  if (matches.length !== 1) throw new Error('Talent unavailable or name ambiguous. Run list and use its full GUID.');
  return matches[0];
}

function locate(proc, classOf, found, guid) {
  const talent = listTalents(proc, classOf, found).find(t => t.guid === guid);
  if (!talent) throw new Error('Talent is not selected in this run.');
  if (!talent.editable) throw new Error('Ultimate and unknown rarity codes cannot be edited.');
  // Display text can refresh independently of identity. Only ownership and the
  // current code participate in the pre-write and post-write checks.
  const { address, record, runtime, controller, entity, context, definition, hero, current } = talent;
  return { address, record, runtime, controller, entity, context, definition, hero, current, guid };
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
  if (args.includes('--help')) {
    console.log('npm run edit:talents -- list\n'
      + 'npm run edit:talents -- "Talent Name" <common|rare|epic|legendary> [--apply]\n'
      + 'npm run edit:talents -- Airbender legendary --live --apply\n'
      + 'Use a full GUID from list when a name is ambiguous. No arguments lists talents.\n'
      + 'Preview by default. --apply writes the selected talent\'s persistent rarity.\n'
      + 'Ultimate talents are listed but cannot be edited.\n'
      + 'Default writes stored rarity only and did NOT upgrade Airbender gameplay.\n'
      + '--live also switches Airbender\'s measured effect selector; gameplay verification is pending.\n'
      + 'Requires the captured Windows game build and an active solo run.');
    return;
  }
  const listing = args.length === 0 || (args.length === 1 && args[0] === 'list');
  if (!listing && (!args[0]?.trim() || !Object.hasOwn(RARITIES, args[1])
    || args.slice(2).some(a => a !== '--apply' && a !== '--live')
    || new Set(args.slice(2)).size !== args.slice(2).length || args.length > 4)) throw new Error('Invalid arguments; use --help.');
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
    for (const name of [...Object.values(C), airbender.SELECTOR_CLASS, airbender.VALUE_UNION_CLASS]) {
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
    const checkSession = () => {
      if (!proc.isAlive()) throw new Error('Game exited.');
      const map = index?.resolve(CURRENT_MAP_ID), session = index?.resolve(GAME_SESSION_SIZE);
      if (map?.status !== 'ok' || map.value < 0 || session?.status !== 'ok' || session.value !== 1) {
        throw new Error('An active solo run could not be verified.');
      }
    };
    checkSession();
    const talents = listTalents(proc, classOf, found);
    if (listing) {
      console.table(talents.map(t => ({ Talent: t.name, Rarity: t.rarity, GUID: t.guid,
        Editable: t.editable ? 'Yes' : 'No', Name: t.nameSource })));
      if (!talents.length) console.log('No talents selected yet.');
      return;
    }
    const talent = chooseTalent(talents, args[0]);
    const live = args.includes('--live');
    const resolve = () => {
      checkSession();
      const held = locate(proc, classOf, found, talent.guid);
      return live ? airbender.inspect(proc, classOf, held) : held;
    };
    const target = resolve();
    const rarity = RARITIES[args[1]];
    console.log(live ? 'Airbender live-selector experiment. Verify POWER strikes after applying.'
      : 'Stored rarity experiment only. Airbender\'s active effect did not upgrade in live testing.');
    console.log(`${talent.name}: ${RARITY[target.current]} -> ${RARITY[rarity]}.`);
    if (!args.includes('--apply')) {
      if (live) console.log(`Live selector case: ${(target.selected - target.cases) / 0x38} -> ${3 - rarity}; cached count: ${target.count} -> ${rarity + 1} (Epic/Legendary mapping inferred).`);
      console.log('Preview only. Add --apply to test the change.');
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
    const apply = live ? airbender.apply : applyChange;
    const result = apply(resolve, (at, payload) => {
      const written = [0];
      return writeMemory(writeHandle, at, payload, payload.length, written) ? written[0] : 0;
    }, target, rarity);
    console.log(JSON.stringify(result));
    console.log(live ? 'Live selector and stored rarity read back. Test actual POWER strikes; gameplay is not yet verified.'
      : 'Stored rarity written and read back. This is not a verified gameplay upgrade.');
  } finally {
    if (writeHandle && closeWrite) closeWrite(writeHandle);
    proc.close();
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { locate, selected, listTalents, chooseTalent, applyChange };
