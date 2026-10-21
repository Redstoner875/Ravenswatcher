# Full terrain map

Game terrain is enabled by default on the Surface layer. The worker reads the installed game's minimap settings, decodes the Big-view base and foreground BC3 textures, composites their alpha, and serves the result from the existing private asset cache. The terrain and POIs do not consult exploration flags. This does not alter game memory, saves or exploration state. The source and executable archives contain no decoded terrain artwork.

The app selects the chapter using `map_name`, rather than guessing it from loaded assets. Missing files, unknown settings layouts and texture failures are reported per chapter; the original POI-only map and other assets remain available. Interiors and All layers use the existing coordinate-only projection because interior terrain frames are not verified.

## Fixed projection

The minimap component contains a rectangle and two view resources. The measured settings are:

| Chapter | Rectangle X | Rectangle Y | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| Dark Hills | -225 | -220 | 450 | 450 |
| Storm Island | -205 | -215 | 420 | 440 |
| Avalon | -208.45 | -207.55 | 440 | 440 |

The parser recognizes the component boundary, length-prefixed Minimap name, measured flags, finite rectangle, two-view count and length-prefixed Big-view texture references. It requires exactly one match. These values are read at runtime, not searched as arbitrary plausible floats or fixed file offsets.

For horizontal coordinates `(x, y)`, the initial projection is:

```
mapX = (x - y) / 2
mapY = (x + y) / 2
u = (mapX - rectangle.x) / rectangle.width
v = (mapY - rectangle.y) / rectangle.height
```

`u,v` address the full texture. Elevation is not added to the flat minimap projection. The image uses a fixed 520-unit square in the SVG, centered at `(400,300)`. It never refits to the observed POI subset or moving hero. Additional rotation/flip operates on both texture and point coordinates around their common center. Icons and labels stay upright.

This projection is supported by the supplied Dark Hills screenshots and exports, rather than reverse engineering the game's executable projection code. The hero moved from `(-148.1224,-54.8249)` to `(-123.1656,-128.0467)` while the exported placements stayed identical. The latter maps to approximately `(u=.5054,v=.2098)`, consistent with the hero at the northern vision tower in the second image. The nearby Harp `6x6_Ruin_01` at `(-109,-156.5)` maps to `(.5528,.1939)` and the northern sacrificial altar at `(-164,-134)` maps to `(.4667,.1578)`, consistent with their visible locations. This supports the scale and handedness as well as the diagonal rotation.

The same transform with each chapter's own rectangle is implemented for Storm Island and Avalon; those two chapters have not been validated against matching in-game screenshots. The UI calls this out. Manual rotation/flip remains available, with separate settings for terrain and coordinate-only views. Exact reproduction of the game's book frame, lighting, fog shader and dynamic terrain changes is outside this implementation.

## Marker accuracy

A category position identifies a tile entity anchor. A selector stores a reward placement anchor. These can differ from the precise minimap marker or objective inside that tile. No compensating offsets were guessed from a screenshot. In particular, this build does not claim that every selector icon is centered on its exact in-game marker. The hero and terrain use the same fixed transform, and raw positions remain exportable for further validation. Live memory offsets were not changed for terrain support.

Harp and sacrificial altar classification is deliberately limited to `6x6_Ruin_01` and `6x6_Bleeding_01`, case-insensitively. Unrelated Ruin/Bleeding scenery remains hidden by default. Harps use the existing Harp art; sacrificial altars use the game's High BloodFountain minimap art. Map-only classification leaves the original grouped roster and manual counts unchanged.

## Validation

- TypeScript build/typecheck, offline coordinate/player/roster suites, terrain settings/projection tests and jsdom interaction tests.
- All three base/foreground texture pairs and rectangles decoded successfully from the user-supplied cooked-file archives; no per-chapter errors.
- Transparent imagery was inspected composited onto the map background, including the Dark Hills coastline, roads and bridges.
- Packaging verifies current renderer, decoder and reader files inside app.asar; the Windows native reader module remains unpacked.
- Cross-built on Linux. The executable has not been launched on Windows here, and no live process was available here. Full original Windows integration tests remain unverified.

## Icon sizing and completion

The global size defaults to 75 and ranges from 24 to 150. Healing fountains and stash icons use the full selected size; story quest markers use 80%. Changing proportions never changes coordinate projection. The size default migrates once from older builds, retaining filters, terrain and orientation preferences.

Healing fountains use `Minimap_IconHigh_Fountain.png`; story quests use `Minimap_IconHigh_Mission.png`, decoded from the installed game. Unknown quest graphics have an SVG exclamation fallback. Non-mirror stash entrances use the underground stash artwork; mirror surface entrances retain their mirror icon. Jack uses ordinary quest exclamation marks. The bean asset and surface arena proxy have been removed; the actual arena remains on its original interior layer.

Previously, image elements disabled pointer events while non-tiered markers had no painted backing element to receive a click. Every map marker now has a transparent rectangular target with `pointer-events=all`; decorative art and the completion X ignore pointer events. The target remains available when the art is gray. Each coordinate-table row also has an independent completion toggle, allowing unresolved and overlapping POIs to be marked without moving their coordinates. Both controls share completion state and undo behavior. Tests exercise bubbling clicks on these targets for healing, sacrifices, stashes, quests and fallback art, plus table/marker synchronization and unresolved-row completion.
