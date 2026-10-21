'use strict';
// Read-only audit. Run once before exploring and again after visiting known POIs.
// node reader/bench/verify-coordinates.js > coordinate-audit.json
const { openProcess, findPid, moduleBase } = require('../win32');
const { PROCESS_NAME } = require('../state');
const tiles = require('../tiles');
function main() {
  const pid = findPid(PROCESS_NAME);
  if (!pid) throw new Error(`${PROCESS_NAME} is not running`);
  const { base } = moduleBase(pid), proc = openProcess(pid);
  try {
    const vtables = {};
    if (!tiles.resolveVtables(proc, base, vtables)) throw new Error('Spawner/selector RTTI not resolved');
    vtables.entityVts = tiles.resolveVtableSet(proc, base, tiles.ENTITY_RTTI);
    const chain = tiles.findSpawnerByChain(proc, base, { vtables });
    if (!chain.ok) throw new Error(chain.diagnostic);
    const selectorAddrs = tiles.findSelectors(proc, vtables.selectorVt);
    const roster = tiles.readPlacedTiles(proc, base, vtables, { spawnerAddr: chain.spawnerAddr, selectorAddrs });
    const crossChecks = selectorAddrs.map(addr => {
      const entity = proc.readPtr(addr + 0x08);
      const entityTypeMatches = tiles.isA(proc, entity, vtables.entityVts);
      const stored = tiles.readPosition(proc, addr + tiles.SELECTOR_POSITION_OFFSET);
      const runtime = entityTypeMatches ? tiles.readPosition(proc, entity + tiles.ENTITY_POSITION_OFFSET) : null;
      return { selector: addr.toString(16), entityTypeMatches, stored, runtime,
        horizontalDistance: stored && runtime ? Math.hypot(stored.x - runtime.x, stored.y - runtime.y) : null };
    });
    console.log(JSON.stringify({ pid, chain, offsets: {
      slotEntity: tiles.SLOT_ENTITY_OFFSET, entityVector: tiles.ENTITY_POSITION_OFFSET,
      selectorVector: tiles.SELECTOR_POSITION_OFFSET,
    }, note: 'RTTI and readable vectors are structural checks only. Compare multiple known POIs in game, including unexplored markers and each chapter. Selector owner and reward position can differ; distance is evidence, not an automatic pass.',
      total: roster?.length ?? 0, positioned: roster?.filter(t => t.position).length ?? 0,
      placements: roster, selectorOwnerCrossChecks: crossChecks }, null, 2));
  } finally { proc.close(); }
}
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { main };
