# Talent rarity editing: discovery stage

The first target is changing an existing talent's rarity during a run.
There is now a source-only experimental write command for Thirst for Immortality.
The installed app has no talent editor. Live gameplay effects after a direct
write remain unverified.

## Experimental Thirst for Immortality write

The 2026-10-23 capture on executable SHA-256
`b9c3642884a8f3a463782f36c9a3a62bc14c88105315220c733fe6c2229ba904`
identified the talent GUID `717e49d62fdb8d4bad49eb879056b1e4`.
Two idle samples were identical. After the reported Common-to-Rare upgrade,
the matching persistent entry's int32 at +0x50 changed from 0 to 1.
The matching runtime window also changed at +0x1B0 and +0x1C8 from 1 to 4;
neither word has been identified as rarity and neither is written.

On that same game build, in an active solo Wukong run with this talent selected,
run from `app/`:

```powershell
npm run edit:talents -- thirst epic
npm run edit:talents -- thirst epic --apply
```

The first command previews. The second writes a four-byte persistent rarity
code and checks it by reading it back. Supported names are `common`, `rare`,
`epic`, and `legendary`. Changing it back uses the same command with the old
rarity. No process address from the capture file is reused.

The command verifies the executable hash, active solo session, hero, selected
GUID, object classes, runtime ownership and current rarity. It resolves again
immediately before the write, refusing changed targets. This is not an atomic
transaction with the game; keep the game idle during the command. A separate
short-lived write handle is opened only with `--apply`. App readers and their
read-only tests remain unchanged. Bench tools do not ship in the installer.

After applying, close and reopen the talent tooltip. Compare its rarity and
numbers with the expected effect, then verify gameplay and chapter transitions.
A successful command establishes only that the persistent field was written
and read back. It does not prove effect recalculation or durability.
If the tooltip or effect does not update, report that before further edits.

The capture also exposed a talent-name lookup failure involving
`Hero_Sun_Wukong`. This command matches GUIDs and actual hero identities and
does not depend on that display-name lookup.

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
