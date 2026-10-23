'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const SETTER_RVA = 0x2E87B0;
const SETTER_START = Buffer.from('40574883ec20488b41684c8bc98910488b79784885ff', 'hex');
const SETTER_END = Buffer.from('498b4168498bc98b104883c4205fe954100000', 'hex');
function exact(proc, at, size) {
  const bytes = proc.read(at, size);
  if (!bytes || bytes.length !== size) throw new Error('Engine target unreadable.');
  return bytes;
}
function ptr(proc, at) {
  const value = Number(exact(proc, at, 8).readBigUInt64LE());
  if (!Number.isSafeInteger(value) || value < 0x10000) throw new Error('Invalid engine target pointer.');
  return value;
}
function inspect(proc, mod, held) {
  if (!exact(proc, mod.base + SETTER_RVA, SETTER_START.length).equals(SETTER_START)
    || !exact(proc, mod.base + 0x2E88D9, SETTER_END.length).equals(SETTER_END)) {
    throw new Error('Engine rarity setter signature differs; nothing written.');
  }
  if (ptr(proc, held.runtime + 0x68) !== held.address || ptr(proc, held.runtime + 0x78) !== held.controller) {
    throw new Error('Engine rarity backing or controller differs; nothing written.');
  }
  let selected = false;
  for (let i = 0; i < 10; i++) {
    if (Number(exact(proc, held.controller + 0x1008 + i * 0x20, 8).readBigUInt64LE()) === held.runtime) selected = true;
  }
  if (!selected) throw new Error('Talent is absent from the live selected slots; nothing written.');
  return { ...held, runtimeVtable: ptr(proc, held.runtime), controllerVtable: ptr(proc, held.controller),
    definitionVtable: ptr(proc, held.definition) };
}
function requestArgs(pid, mod, target, rarity) {
  if (!Number.isInteger(rarity) || rarity < 0 || rarity > 3 || !/^[a-f0-9]{32}$/.test(target.guid)) {
    throw new Error('Invalid engine request.');
  }
  return [pid, mod.base, target.runtime, target.controller, target.entity, target.context,
    target.definition, target.address, target.runtimeVtable, target.controllerVtable,
    target.definitionVtable, target.current, rarity].map(n => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid engine request address.');
    return n.toString(16);
  }).concat(target.guid);
}
function apply(resolve, pid, mod, target, rarity) {
  const fresh = resolve();
  if (JSON.stringify(fresh) !== JSON.stringify(target)) throw new Error('Talent changed since preview; nothing written.');
  const exe = path.join(__dirname, 'native', 'bin', 'talent-call.exe');
  if (!fs.existsSync(exe) || !fs.existsSync(path.join(path.dirname(exe), 'talent-hook.dll'))) {
    throw new Error('Native engine helper is missing. Download the branch CI talent-engine-helper artifact into reader/bench/native/bin, or run native/build.cmd from an x64 Visual Studio developer prompt. Nothing written.');
  }
  const child = spawnSync(exe, requestArgs(pid, mod, fresh, rarity), { encoding: 'utf8', windowsHide: true });
  if (child.error) throw new Error('Engine helper could not start: ' + child.error.message);
  if (child.status !== 0) throw new Error(child.stderr.trim() || 'Engine helper failed; inspect the game before retrying.');
  let result;
  try { result = JSON.parse(child.stdout.trim()); }
  catch { throw new Error('Engine helper response unreadable; changes may remain.'); }
  if (!result.engine_setter_completed || result.current !== rarity) throw new Error('Engine setter did not confirm completion; changes may remain.');
  const after = resolve();
  if (JSON.stringify({ ...after, current: fresh.current }) !== JSON.stringify(fresh) || after.current !== rarity) {
    throw new Error('Engine setter returned but final target changed; changes may remain.');
  }
  return { ...result, previous: fresh.current, gameplay_verified: false };
}
module.exports = { inspect, requestArgs, apply, SETTER_RVA, SETTER_START, SETTER_END };
