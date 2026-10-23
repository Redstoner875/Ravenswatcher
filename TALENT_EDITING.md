# Experimental talent rarity editor

**Gameplay upgrade is not implemented.** Live Airbender testing changed
Common (0) to Legendary (3) in persistent data and the tooltip's rarity label,
but POWER still had its Common effect. The screenshot also retained the
one-extra-strike description. Treat the existing writer as a stored-data
experiment, not a working rarity upgrade. Thirst's earlier tooltip change
did not establish actual stat application either.

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
recalculation path, and be verified by the POWER's behavior. No such live
field or callable upgrade path has been established from the existing log.

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
