'use strict';
// Runs only against our disposable window process, never a game.
const assert = require('assert/strict');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
async function scenario(mode) {
  const dir = path.join(__dirname, 'bin', 'test');
  const child = spawn(path.join(dir, 'test-fixture.exe'), [mode], { windowsHide: false });
  let buffer = '', pending = [], lines = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    buffer += data;
    for (;;) {
      const index = buffer.indexOf('\n'); if (index < 0) break;
      const line = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      if (pending.length) pending.shift()(line); else lines.push(line);
    }
  });
  const next = () => Promise.race([
    lines.length ? Promise.resolve(lines.shift()) : new Promise(resolve => pending.push(resolve)),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('fixture timed out')), 20000); timer.unref(); }),
  ]);
  try {
    const ready = await next();
    const call = spawnSync(path.join(dir, 'talent-call.exe'), ready.args, { encoding: 'utf8', timeout: 18000 });
    assert.ifError(call.error);
    if (mode === 'success') {
      assert.equal(call.status, 0, call.stderr);
      const response = JSON.parse(call.stdout);
      assert.equal(response.current, 3); assert.equal(response.engine_setter_completed, true);
      assert.deepEqual(await next(), { fixture_effect: 4, correct_thread: true });
    } else {
      assert.equal(call.status, 2, call.stderr);
      assert.match(call.stderr, /nothing written/);
      if (mode === 'cancel') assert.deepEqual(await next(), { cancelled_rarity: 0 });
    }
  } finally { child.kill(); }
}
(async () => {
  await scenario('success'); await scenario('stale'); await scenario('cancel');
  console.log('Native dispatch: callback runs on target window thread; stale and cancelled requests never invoke setter.');
})().catch(e => { console.error(e); process.exitCode = 1; });
