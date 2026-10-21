# Player portraits and tracking

Player positions have a dedicated 50 ms (20 Hz) timer. Full readout state remains on its 250 ms timer; discovery and terrain decoding keep their existing worker schedules. The player timer reads cached hero controllers, validates their vtable/entity/context, reads current positions and names, and never scans the heap.

The reader emits player-only frames with `type: "players"`, `pid`, `map_id`, `player_poll_ms`, and `players`. Electron forwards them through `readout:players`, exposed as `ravenswatch.onPlayers`. Full snapshots continue through `readout:state` and include `player_poll_ms: 50`. Both timers are cleared on shutdown. Player-only frames never replace queued full snapshots or trigger full-page rendering.

Each player may include `hero`, the skin entity name read using the same chain as the existing run-stat reader: entity + 0x28 -> settings, settings + 8 -> game string header. A failed identity read leaves tracking available without a portrait. Positions retain the existing X, elevation, Y conversion.

Portraits are decoded from the installed game by the existing asset builder. `HERO_ENTITIES` maps definition-referenced entity owners to the corresponding `HERO_ICONS` key; the longest matching owner plus an optional underscore-delimited skin suffix wins. Unknown identities and missing artwork keep a diamond marker. No game artwork is bundled.

Every detected co-op player receives their own portrait and colored position pointer. Solo selects the only player automatically; co-op preserves the existing explicit player selector. Hero names are shown in the selector and tooltips. Local controller ownership and facing direction are not inferred. The pointer indicates position only.

Movement is interpolated over 50 ms using requestAnimationFrame. Stationary markers stop requesting animation frames. Large position jumps (over 40 world units), gaps over 300 ms, and process/map changes snap instead of sliding across the map. Follow-player uses the same interpolated position. Incorrect process/map frames and player updates outside a run are ignored. Interior player overlays retain the existing restriction.

## Verification

- npm --prefix app run build
- npm --prefix app run typecheck
- node app/reader/test/run-map-offline.js
- node app/assets/test-terrain.js
- node app/reader/test/test-history-art.js
- node app/reader/test/test-assets-tables.js
- NODE_PATH=<directory containing jsdom> node app/web/test/test-poi-map-dom.js
- NODE_PATH=<directory containing jsdom> node app/web/test/test-player-portraits.js

The offline stream fixture verifies independent 50/250 ms timers, multiple heroes, transition guards and shutdown cleanup. DOM fixtures verify portrait resolution, skin aliases, fallback, interpolation, player selection and unchanged POI nodes. Actual timer cadence, identity/artwork matching for every installed hero and co-op movement still require in-game Windows validation.

The supplied Windows update reuses the uploaded Windows distribution and replaces its app.asar with the updated compiled runtime. Electron and native Windows binaries are preserved. The Windows executable has not been launched in this environment. Fully extract the Windows ZIP before running Ravenswatcher.exe.

## POI outline colors

The map uses bright green (#1fff00), yellow (#ffff00) and red (#ff0000) tier outlines. Red and green were checked against the supplied game screenshot; yellow uses a saturated yellow. Outlines use their game texture alpha masks without added circles. Icons with an outline but no resolved tier now retain a neutral outline instead of dropping it. Completion still applies grayscale and X; undo restores the tier color. The grouped roster keeps its existing styling.
