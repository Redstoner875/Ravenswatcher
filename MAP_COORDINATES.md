# POI coordinates and spatial map

Open **POI map · open / close** in the **On the map** header. The original icon roster and manual done counters still work. The map has saved group and per-resource visibility filters, icon sizing from 24 to 150 (default 75), colored game-icon outlines without circular badges, pan/zoom, Fit map, surface/interior layers, tooltips, a table, and JSON export. Small crystal placements (3x3/6x6/Crystal01 variants), teleporters, building materials, camp tiles, scenery and other placements start hidden. Big Dream Crystals and CrystalFields remain enabled; other categories start enabled. `6x6_Ruin_01` is a Harp and `6x6_Bleeding_01` is a Sacrificial Altar: both have their own enabled categories and game icons. Existing Scenery settings do not hide them. Show all enables every observed type, including normally hidden ones. This defaults update resets saved visibility selections once, while retaining rotation, icon size and player settings; subsequent custom visibility changes are saved normally. Filtering never changes the coordinate projection. Every roster entry is retained, including repeated resources, unrecognised names, scenery and unresolved positions. Selecting a marker shows its raw resource and exact float values.

Game terrain is now enabled by default on the Surface layer. The app decodes the chapter's high-resolution terrain and foreground artwork from the installed game, without exploration fog, and uses fixed game-data bounds. Disable **Game terrain** to return to the original POI-only view. Unsupported or missing terrain falls back to that view without disabling the other panels. See TERRAIN_ALIGNMENT.md for projection evidence and limits. Tile positions are the tile entity's anchor; a specific objective inside that tile can be offset from that anchor. Selector positions are the stored reward placements. Neither is inferred from the roster order or random layout.

## Manual completion marks

Click an enabled POI marker to toggle completion for that specific placement. Its artwork becomes grayscale and dimmed with an X overlay. Click again to undo; keyboard Enter/Space does the same. Every displayed POI type is clickable, including healing fountains, sacrificial altars, stash entrances and quests. Each marker has a transparent rectangular hit area independent of its icon or tier outline; no visible badge or circle is added. The coordinate table also has a Mark complete / Undo button for each individual row, including overlapping markers and unresolved locations. Map and table completion controls stay synchronized. Separate chests/crystals with the same name and icon keep independent marks. Coordinates and selected-player distance still appear below the map.

Marks survive filtering, rotation, POI refreshes and player updates. **Clear completed marks** clears them together. Marks belong to the current displayed map and app session: they reset on a map/process change, when the app observes no run, or when the app is reopened. They are manual annotations, separate from the original grouped roster's done counters.

## Player tracking

Live hero-controller addresses are discovered on the existing background sweep. Coordinates are reread on the normal 250 ms frame poll, without heap scans in the poll loop. Each controller must still match the discovered RTTI vtable and point to an entity with a live scene context. Missing reads, retired controllers and map mismatches suppress the marker rather than retaining a frozen last position. Initial discovery can lag by a sweep; additional co-op heroes can take the existing four-sweep rescan cadence to appear.

Solo play automatically selects the sole detected hero. In co-op, the reader does not know which controller belongs to the local player: all detected heroes have numbered markers and a **My character** dropdown. Move to identify your marker and select it. **Follow my character** keeps it centered; dragging or Fit map turns follow off. A selected surface POI shows horizontal distance in game coordinate units. Player diamonds do not claim a facing direction.

Player overlays and distance are suppressed on the interior-only layer because its coordinate frame is unverified. Interior entries in All layers also have no player distance. Filters apply to map markers and table rows; JSON retains the complete unfiltered roster and current players. Filters, size, selected character and follow/show settings are saved locally. The original grouped POI list and done counters remain unchanged.

Existing game artwork is reused. Healing fountains now use the game's fountain artwork, and story quest placements use its High Mission exclamation mark. Refugee camps and refugee NPCs retain their white flag artwork. Healing and stash artwork now uses the full global icon size; side-quest marks use 80%. Completion X overlays follow each marker's adjusted size. Non-mirror surface stash entrances use the same generic stash icon as their underground rooms, while mirror surface entrances retain the mirror artwork. Room names remain available in the tooltip.

The new size default of 75 is applied once to settings from earlier builds, preserving visibility and orientation settings. Subsequent custom sizes, including 150, are saved normally. Unknown quest graphics have a yellow/red exclamation-mark fallback.

Jack quest placements use the same exclamation-mark artwork as other story quests. There is no bean marker, surface arena proxy or link to the underground arena. The arena remains on its original interior layer.

## Position fields and evidence

Spawn areas are enabled by default in their own filter category. Dark Hills
`Start_Update3` and Storm Island/Avalon `Starting_Tile_Update3` names are
recognized with optional size/chapter prefixes. They use `map_spawn.png`,
decoded at runtime from `Ui/MiniMap/Icons!Map_Icons_Sandman.png.Texture.dxt`.
The supplied cooked MiniMap archive was decoded to verify this is the purple
raven on a gold compass background (48 × 48). No texture is bundled. The
existing Sandman marker retains its separate high-resolution texture. The
grouped roster is unchanged; this mapping applies to individual map placements.

| Field | Offset | Evidence already in this source archive |
| --- | --- | --- |
| Hero owning entity / live scene context | `controller + 0x08` / `entity + 0x30` | Existing `bench/nearest-poi-watch.js` and `melodies.ts` |
| Tile slot live entity | `TileSlot + 0x18` | `reader/tiles.ts`, `bench/nearest-poi-watch.js`, `bench/camp-clearance-watch.js` |
| Tile entity horizontal X | `entity + 0x2E0` | `bench/nearest-poi-watch.js`, `bench/camp-clearance-watch.js` |
| Tile entity elevation | `entity + 0x2E4` | Middle float of the contiguous vector; semantic interpretation needs live confirmation |
| Tile entity horizontal Y | `entity + 0x2E8` | Same two benches |
| Selector horizontal X / elevation / horizontal Y | `selector + 0x6C / 0x70 / 0x74` | `bench/tiles-census.js`; horizontal axes also read by `nearest-poi-watch.js` and `camp-clearance-watch.js`; `selector-tier-field.js` excludes these as position fields |
| Selector resource / tier | `selector + 0x78 / 0x68` | Existing production reader; unchanged |

The public `position` shape is `{ x, y, z }`: X and Y are horizontal, Z is elevation. Memory vector order is X, elevation, Y. In the POI-only view, map orientation is set manually: **Rotation** provides a slider and exact degree input from -180° to +180° in 0.1° steps, clockwise on screen. The 15° buttons give quick adjustments. **Flip vertically** changes handedness before rotation, since a mirror mismatch cannot be fixed by rotation alone. **Reset rotation** restores the original axes (0°, flipped vertically). The chosen angle and flip are saved locally across runs and app restarts. Adjusting orientation refits the view; icons and labels remain upright. Raw coordinates, exported values, horizontal distances, and the player/POI relationship are unchanged. Tick labels appear only in the unrotated original-axis view, where they correctly represent world X/Y. Terrain uses the automatic projection documented in TERRAIN_ALIGNMENT.md. Its rotation/flip controls are additional adjustments, saved separately from the POI-only view; Reset rotation restores automatic terrain alignment.

The live worker resolves entity RTTI and checks tile entities against that vtable set before reading their positions. Selectors are already discovered through their RTTI vtable. Position reads require all twelve bytes, finite floats and an absolute-value limit of ten million units. Zero, including `(0, 0, 0)`, remains valid. These checks reject some corrupt reads; plausible floats and matching RTTI cannot prove a field's meaning or correctness for a new game build. No new static RVA is introduced. Existing static roots and their RTTI checks remain unchanged.

## Unexplored locations and completeness

The code reads generated category slots, sublevel slots and reward selectors without testing exploration flags, distance, screen visibility or fog. Thus unexplored placements can appear as soon as their position-bearing data is resident. Reward selectors store placement coordinates even when their spawned reward/owner entity is absent.

There is no established fallback for a category/sublevel with no live entity. Such entries remain visible as **Unresolved**; the reader does not invent coordinates from slot metadata. Nor is there a known completeness signal for the selector scan. The existing worker continues scanning every 1.5 seconds while changing and every 15 seconds once settled. The displayed coverage is for the observed roster, not proof that every in-game POI has been found. Different layers can have local coordinate frames, so interior rooms are separate by default.

## Build and run (Windows)

Use the same Node toolchain as the original project:

```powershell
cd app
npm ci
npm start
```

The source archive contains editable code. The separate Windows x64 archive contains Ravenswatcher.exe and its required runtime files. It preserves the original package versions and read-only process adapter. No memory writes, injection, exploration-state changes or game hooks were added.

## Validate against your game

From `app`, while a map is loaded:

```powershell
npm run build
node reader/bench/verify-coordinates.js > coordinate-audit.json
```

The audit closes its process handle and reports the existing static chain diagnostics, RTTI entity matches, offsets, every observed placement, coordinate coverage, and selector placement versus owning-entity coordinates where available. A distance is supporting evidence, not an automatic pass; the owner may have a different anchor.

1. Record the game version and capture an audit before exploring.
2. Visit several distinct named POIs in different directions and verify the relative location and distance scale against the game map. Check repeated POI types individually.
3. Confirm that those positions were already present in the pre-exploration audit. Compare selector stored positions and the corresponding runtime entity when available.
4. Repeat across all chapters and an underground room. Check tile anchor versus actual objective position, horizontal axis orientation, and whether interior coordinates are local.
5. After a game update, repeat these checks. Treat suspiciously identical or clustered coordinates as an offset warning even if they are finite. Do not declare offsets verified solely from coverage or RTTI.

## Validation performed here

- `npm run build` and `npm run typecheck`: passed.
- `node reader/test/run-map-offline.js`: passed player and coordinate fixtures plus the original tile reader/worker and tile view suites. On Linux this runner substitutes only the Win32 scratch-buffer adapter; fixture memory and production extraction/state/projection logic are exercised. It does not validate live game memory.
- New fixtures cover literal offsets, distinct repeated placements, exploration-independent selector coordinates with no owner, sublevels, missing entities/bytes, wrong entity RTTI, NaN/infinity/out-of-range values, legitimate zero values, position change notifications, state propagation, layers, and aspect-preserving projection.
- Optional `web/test/test-poi-map-dom.js` with jsdom: passed rendering, safe labels, group and individual filters, stable projection, size persistence, colored masks without circles, live player updates without rebuilding POI markers, co-op selection, follow, distance, loading/empty states, pan/zoom/fit handlers and export. SVG screen transforms were stubbed because jsdom has no layout engine. Browser visual appearance and actual pointer transforms still need an Electron check.
- Full original `run-all.js`: attempted but blocked by Windows `kernel32.dll` dependencies in this Linux environment. Windows process integration and Electron UI regression suites remain unverified here.
- No running Ravenswatch process was available here. User-provided exports and matching screenshots now support hero movement and the Dark Hills terrain transform. This is external comparison evidence, not a direct live memory audit. Other chapters' alignment still needs an in-game check.


Manual rotation is tested at positive, negative, boundary and fractional angles, with both flip settings, including inverse round trips and distance preservation. DOM tests cover slider/numeric synchronization, quick buttons, flip, reset, persistence and existing player/filter behavior.

Terrain tests: `node assets/test-terrain.js` checks recognized serialized settings, rejects truncated/ambiguous/NaN inputs, verifies fixed projection and rotated inverse round trips, and checks optional asset failure. DOM coverage includes terrain arriving after a frame, marker/image rotation together, separate saved orientations, completion retention and terrain/layer failure fallback. The supplied cooked-file archives successfully decoded all three chapters; no decoded game art is bundled.
