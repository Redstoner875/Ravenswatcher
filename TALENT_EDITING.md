# Talent rarity editing: discovery stage

The first target is changing an existing talent's rarity during a run.
The editor and game-memory writes are not implemented yet.

`reader/runs.ts` identifies the selected talent GUIDs, skill definitions,
owned skill controllers, localized names and descriptions. It reads rarity
as an int32 at persistent skill data +0x50. That is evidence for reading
saved rarity, not evidence that writing it updates a live talent's effects.
Runtime rarity, recalculation and persistence behavior still need measurement.

## Capture a normal upgrade

Use a Windows source checkout with Node.js 22.15 or newer. Start an active
solo run and choose a talent that can be upgraded normally. From `app/`:

```powershell
npm ci
npm run probe:talents
```

1. Type `before` and press Enter while standing still.
2. Type `idle` and press Enter without changing talents. This measures noise.
3. Upgrade exactly one talent through the game's normal upgrade interface.
4. Type a label such as `after-dash-common-to-rare` and press Enter.
5. Take another idle capture. If possible, repeat with a second normal upgrade.
6. Type `q` and press Enter to finish.

The output is `app/talent-rarity-capture.jsonl`. Supply a different filename
with `npm run probe:talents -- talent-rarity-capture-2.jsonl` for another session.
An existing file is never overwritten. Record which talent you upgraded, its
before/after rarity, and whether its displayed numbers and actual effect changed.

The probe uses the existing read-only process handle. Each requested capture
rescans and validates hero ownership and RTTI before reading. It logs the game
executable hash, selected talents when readable, persistent data and exploratory
0x200-byte windows at live skill controllers. The window is not a measured
object size; bytes beyond an object's end may belong to adjacent memory.
Changed words are evidence to investigate, not automatic write targets.
Changed ownership, contexts or definitions appear as removed/added objects
rather than upgrades. Saved records may lag gameplay; unavailable records
and partial reads are reported explicitly.

## Implementation after measurement

Confirm candidate changes across repeat upgrades and idle controls. Verify
the live field and the game's effect-recalculation mechanism, then implement
a rarity-only operation identified by the current hero and talent GUID.
The backend must resolve and revalidate ownership at apply time; the UI must
not pass raw addresses. Verify actual gameplay effects, displayed rarity,
chapter transitions and saved results before calling editing supported.

The current diagnostic is a source-development tool, excluded from packaged
releases with the other `reader/bench` probes. It does not add a working editor
to the installed app.
