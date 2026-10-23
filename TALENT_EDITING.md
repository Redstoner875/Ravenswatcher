# Experimental talent rarity editor

**Gameplay upgrade is not implemented.** Live Airbender testing changed
Common (0) to Legendary (3) in persistent data and the tooltip's rarity label,
but POWER still had its Common effect. The screenshot also retained the
one-extra-strike description. Treat the existing writer as a stored-data
experiment, not a working rarity upgrade. Thirst's earlier tooltip change
did not establish actual stat application either.

## Airbender live-selector/count experiment

**The first live test refused the count layout** with `Live count union class
is unsupported`, before opening a write handle. Starting a new run is
supported; the command resolves new addresses and does not reuse the log's
addresses. The boxed-count class assumption is still unverified and its
guard remains in place.

For a targeted, read-only layout report:

```powershell
npm run edit:talents -- Airbender legendary --inspect
```

This writes `app/airbender-live-layout-<timestamp>.json`, with the actual
embedded RTTI class names, four case records and up to two pointer hops into
their boxed payloads. The report is limited to 256 nodes. Module pointers,
hero entities/contexts/controllers and settings roots are excluded from
the pointer walk. Unreadable nodes are reported, not treated as zero.
Reports are ignored by Git. Unknown classes are resolved by inverse RTTI
for diagnostics; they do not become accepted writer layouts. `--inspect`
cannot be combined with `--apply` and never opens a write handle. A live
preview refusal also attempts to save this report automatically, before
any write access is opened. A failure after writes retains its partial-state
error and does not claim that nothing was written.

The uploaded normal-upgrade capture (before/idle/after/idle-after) confirms
Airbender's persistent code changed 0 -> 1. The owned component named
`Skill Power Extra Targets Count Selector`, class `oCEntityCpntValueSelector`,
changed only its +0x80 selected-case pointer: from vector base +0xA8 to
base +0x70. The +0x70 vector header has four entries. The observed delta is
0x38 bytes. The apparent change at the preceding Count Operand's +0x168 is
this same physical word in an adjacent object, not a second field to write.
Idle controls changed only an unrelated UI animation.

This gives an experimental descending case mapping: Common case 3 and Rare
case 2 are observed; Epic case 1 and Legendary case 0 are inferred. No normal
Epic/Legendary upgrade is present in the log. The broad capture hit its
2048-node limit and captured roots but not their linked cache payloads.

On the measured game build with Airbender selected in a solo Wukong run:

```powershell
npm run edit:talents -- Airbender legendary --live
npm run edit:talents -- Airbender legendary --live --apply
```

`--live` is Airbender-specific. It resolves the current hero and talent as
usual, then verifies the unique owned selector by RTTI and exact settings
name, four-entry table shape and an aligned in-table current selection.
It also validates the embedded +0x88 `oCEntityValueUnion`, reads its +0x90
boxed-int pointer using the reader's existing union convention, and requires
a count between 1 and 4 that agrees with the observed case order. This count
interpretation is a guarded hypothesis: its payload was not in the capture.
If any check fails, the command refuses the experiment.

Applying writes the persistent rarity, selected-case pointer and boxed count
(rarity + 1, so the Legendary candidate is 4). It never edits the case table,
changes unrelated talent controllers or writes the unexplained runtime flags
at +0x1B0/+0x1C8. It revalidates object identity and live values between writes,
allows the engine to converge to the requested count, and checks final
readback. These writes are not atomic; a failed write/readback reports that
partial changes may remain. No automatic rollback into uncertain memory is
attempted. Ownership changes halt further writes.

A successful result explicitly says `gameplay_verified: false`. Verify actual
POWER strikes in-game and whether the state remains applied. Pointer/count
readback alone is not evidence that the engine consumes this cache, nor that
changes persist across a chapter. Other talents have no live-effect handler.
The original command without `--live` remains a stored-only experiment.

## Find the live effect path

The next capture must include the effect's live state, not just persistent
skill data. The probe's `--deep` mode records owned hero components and up to
two pointer hops into RTTI-identified objects such as value listeners/caches.
It is read-only and reports node limits and read errors. The 0x200-byte
windows are exploratory, not established object sizes or write targets.

For Airbender, first restore its stored rarity to Common so it matches the
observed active effect:

```powershell
npm run edit:talents -- "Airbender" common --apply
npm run probe:talents -- talent-rarity-capture-airbender.jsonl --deep
```

Type `before`, then `idle` without changing anything. Upgrade Airbender via
the game's normal upgrade interface, then type `after-normal-upgrade`, then
`idle-after`, and finish with `q`. Note the actual additional strikes before
and after. The log allows comparison of a real upgrade's effect state with
the failed stored-only write. Do not use the edit command for the upgrade
being measured. If a normal upgrade is not currently available, capture it
when one is available; memory diffs alone cannot establish active effects.

The actual fix must update the live effect or invoke its genuine upgrade/
recalculation path, and be verified by the POWER's behavior. The new live-selector/count experiment tests the candidate described above;
no callable upgrade/recalculation path or gameplay fix is yet verified.

The source-only editor lists the current hero's selected talents and changes
one selected talent's rarity. It works by GUID on the measured game build,
without hardcoded hero or talent names. The installed app has no editor yet.

## Use

Use a Windows source checkout with Node.js 22.15 or newer. Start an active
solo run, then run from `app/`:

```powershell
npm ci
npm run edit:talents -- list
```

The list shows talent names, rarities, GUIDs and whether each talent is editable.
No arguments also lists talents. Display names come from the game's localized
settings or runtime text listener. If a name is unavailable, its internal key
is shown instead and the Name column says `internal`.

Copy a complete name from the list. Preview, then apply a change:

```powershell
npm run edit:talents -- "Thirst for Immortality" legendary
npm run edit:talents -- "Thirst for Immortality" legendary --apply
```

Use the full GUID instead when a name is ambiguous or unavailable:

```powershell
npm run edit:talents -- 717e49d62fdb8d4bad49eb879056b1e4 legendary --apply
```

Supported target rarities are `common`, `rare`, `epic`, and `legendary`.
Ultimate (code 4) and unknown rarity codes are listed but cannot be edited.
Unselected talents cannot be added with this command. The old `thirst`
shortcut remains supported. Names match exactly, ignoring case; partial
name matching is intentionally unsupported.

The command checks the executable hash, active solo session, selected GUID,
object classes, runtime ownership, hero identity and current rarity. It
resolves again immediately before the write and verifies readback. Keep the
game idle during the command: this is not an atomic transaction with the game.
The writer changes only four bytes at the selected persistent entry's +0x50.
A separate short-lived write handle opens only with `--apply`. Normal app
readers remain read-only. Both bench tools are excluded from installer builds.

## Live evidence and limits

The 2026-10-23 Wukong capture on executable SHA-256
`b9c3642884a8f3a463782f36c9a3a62bc14c88105315220c733fe6c2229ba904`
identified Thirst for Immortality as GUID
`717e49d62fdb8d4bad49eb879056b1e4`.
Idle samples were identical; a reported normal Common-to-Rare upgrade changed
persistent +0x50 from 0 to 1. A subsequent direct Rare-to-Epic write read back
successfully and the user's screenshot showed Epic and a +150 Vitality
completion bonus, previously Rare and +125 Vitality.

This verifies Thirst's stored rarity and tooltip update. Actual stat
application, other talents/heroes, chapter transitions and save persistence
still require live tests. Other talent edits use the same measured persistent
skill class and field but are experimental, not individually verified.
After each edit, reopen the tooltip and compare its numbers and actual effect.
Report failures before making further edits.

Runtime words +0x1B0/+0x1C8 changed from 1 to 4 in the capture; neither is
identified as rarity or written. Captured process addresses are never reused.
The editor refuses a different executable hash until its layout is measured.

The shared reader now exposes GUIDs and accepts the explicit Wukong owner
alias `Hero_SunWukong` for the `Sun_Wukong` definition path, retaining exact
ownership checks and duplicate rejection. The editor also resolves names
directly from validated, owned runtime definitions rather than deriving them
from a hero's filename.

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

## Before app integration

Verify actual stat application, other talents and heroes, chapter transitions
and saved results. Future UI requests must identify the talent by GUID and
resolve/revalidate ownership in the backend, without accepting raw addresses.

The current diagnostic is a source-development tool, excluded from packaged
releases with the other `reader/bench` probes. It does not add a working editor
to the installed app.
