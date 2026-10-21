'use strict';
// Portable fixture runner. The real Win32 adapter is never loaded or exercised.
if (process.platform !== 'win32') {
  const id = require.resolve('../win32');
  require.cache[id] = { id, filename: id, loaded: true, exports: {
    scratch(size) { const ab = new ArrayBuffer(size); return { ab, buf: Buffer.from(ab), ptr: Buffer.from(ab) }; },
    openProcess() { throw new Error('Live process access unavailable in offline tests'); },
  } };
}
(async () => {
  let failures = 0;
  for (const name of ['test-player-stream', 'test-players', 'test-coordinates', 'test-tiles', 'test-tiles-view']) {
    try { failures += (await require(`./${name}`).main()) || 0; }
    catch (e) { console.error(name, e); failures++; }
  }
  process.exitCode = failures ? 1 : 0;
})();
