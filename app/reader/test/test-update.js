'use strict';
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const { parseVersion, newerVersion, checkForUpdate, createUpdateController, LATEST_URL } = require('../../update');
const response = (status, body) => ({ ok: status === 200, status, json: async () => body });
const release = (tag, extra = {}) => ({ tag_name: tag, draft: false,
  assets: [{ name: `Ravenswatcher-${tag}-win-x64-Setup.exe` }], ...extra });

async function main() {
  assert.deepEqual(parseVersion('v0.1.7'), [0, 1, 7]);
  for (const value of ['0.1', 'junk', undefined]) assert.equal(parseVersion(value), null);
  assert.equal(newerVersion('0.1.7-beta.9', 'v0.1.7-beta.10'), '0.1.7-beta.10');
  assert.equal(newerVersion('0.1.7-beta.10', 'v0.1.7'), '0.1.7');
  assert.equal(newerVersion('0.1.7', 'v0.1.7-beta.11'), null);
  assert.equal(newerVersion('0.1.7-beta.10', 'v0.1.7-beta.9'), null);
  assert.equal(newerVersion('junk', 'v0.1.7'), null);
  const result = await checkForUpdate(async (url, opts) => {
    assert.equal(url, LATEST_URL);
    assert.match(url, /Redstoner875\/Ravenswatcher/);
    assert.ok(opts.signal instanceof AbortSignal);
    return response(200, [release('v0.1.7-beta.11'), release('v0.1.7-beta.12', { draft: true }),
      release('v0.1.7-beta.13', { assets: [] }), release('v0.1.7-beta.9')]);
  }, '0.1.7-beta.10');
  assert.equal(result.latest, '0.1.7-beta.11');
  assert.equal(result.url, 'https://github.com/Redstoner875/Ravenswatcher/releases/tag/v0.1.7-beta.11');
  assert.equal((await checkForUpdate(async () => response(200, []), '0.1.7')).latest, null);
  for (const fetch of [async () => response(403, {}), async () => response(200, {}), async () => { throw Error('offline'); }]) {
    const failure = await checkForUpdate(fetch, '0.1.7');
    assert.equal(failure.ok, false);
    assert.equal(failure.latest, null);
    assert.equal(typeof failure.reason, 'string');
  }

  const updater = new EventEmitter(), states = [], order = [];
  let resolveCheck, rejectDownload, checks = 0;
  updater.checkForUpdates = () => { checks++; updater.emit('checking-for-update'); return new Promise(r => { resolveCheck = r; }); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent, true); assert.equal(restart, true); order.push('install'); };
  const control = createUpdateController({ updater, current: '0.1.7-beta.1',
    onState: s => states.push(s), beforeInstall: async () => { order.push('reader stopped'); } });
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal((await control.install()).ok, false);
  const first = control.check(), second = control.check();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(checks, 1);
  updater.emit('update-available', { version: '0.1.7-beta.2' });
  updater.emit('download-progress', { percent: 42.5 });
  assert.equal(control.state.percent, 42.5);
  resolveCheck({ downloadPromise: new Promise((_, reject) => { rejectDownload = reject; }) });
  await first;
  rejectDownload(Error('Download interrupted'));
  await Promise.resolve();
  assert.equal(control.state.status, 'error');
  assert.equal(control.state.latest, '0.1.7-beta.2');
  updater.emit('update-downloaded', { version: '0.1.7-beta.2' });
  await control.check();
  assert.equal(checks, 1); // ready downloads are never downloaded again
  assert.deepEqual(order, []); // download never restarts the app
  const install = control.install();
  assert.equal((await control.install()).ok, false); // double clicks are rejected
  assert.equal((await install).ok, true);
  assert.deepEqual(order, ['reader stopped', 'install']);
  assert.ok(states.some(s => s.status === 'downloaded'));
  console.log('test-update: ok (own releases, prerelease ordering, progress, retry, no premature restart, reader shutdown)');
  return 0;
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 1; });
