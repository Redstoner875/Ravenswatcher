# Experimental talent rarity editor

**Actual gameplay is still awaiting a live test.** The stored-only editor was
confirmed to change Airbender's tooltip while leaving its Common effect active.
The replacement `--live` path calls the game's own rarity setter, identified
in the supplied executable. Successful completion is not a claim that actual
POWER strikes, all other talents, chapters or saves have been verified.

## Windows test build

Download the latest successful CI run's **talent-rarity-test-build** artifact
for the `talent-rarity-discovery` branch. Extract it into a new folder. It
contains the source checkout plus the compiled helper in the correct place;
open its `app/` directory in PowerShell. The main installer does not include
the experimental editor.

For an existing up-to-date branch checkout, the smaller **talent-engine-helper**
artifact contains just `talent-call.exe` and `talent-hook.dll`; extract both
directly into `app/reader/bench/native/bin/`.

Alternatively, build the helper from an **x64 Visual Studio developer command
prompt** with `app\reader\bench\native\build.cmd`. Node alone cannot compile
this native helper. The helper is excluded from normal installer staging.

Start an active solo run with Airbender selected. Stand idle, with no upgrade
menu or chapter transition in progress. From `app/` in PowerShell:

```powershell
npm ci
npm run edit:talents -- list
npm run edit:talents -- Airbender legendary --live
npm run edit:talents -- Airbender legendary --live --apply
```

Preview is read-only. Applying loads the source-built DLL through a targeted
Windows message hook and calls the fixed engine setter on the game's window
thread. It does not call engine code on a newly created remote thread, patch
executable code, or write guessed selector/count fields. Whether the window
thread is the appropriate simulation context for this game still requires
live verification. An engine fault can leave partial state; restart that run
instead of retrying after a fault or in-progress timeout.

A request pending for ten seconds is cancelled before execution. A request
already running cannot be safely cancelled: the error explicitly says changes
may remain or complete later. The hook and host handles are released after
each request. The engine callback performs its own fresh ownership, GUID,
selected-slot, backing-pointer, expected-rarity and code-signature checks.
The JS launcher additionally checks the full executable SHA-256 and solo run.

`engine_setter_completed: true` means the routine returned and the stored
rarity read back correctly. Test **actual additional POWER strikes**, not just
the tooltip. `gameplay_verified` intentionally remains `false`. Calling the
setter even when stored rarity already equals Legendary is intentional: an
older stored-only edit may have left the effect at Common.

For another selected ordinary talent, replace `Airbender` with its complete
localized name or GUID from `list`. The setter is shared across ordinary
talents; individual gameplay effects are not yet verified. Ultimate/code 4,
unknown rarities, unselected talents, multiplayer and other executable builds
are refused. Common/Rare/Epic/Legendary are codes 0/1/2/3.

Without `--live`, `--apply` retains the old four-byte stored-only experiment;
it is not a gameplay upgrade.

## Executable evidence, 2026-10-23

Measured executable SHA-256:
`b9c3642884a8f3a463782f36c9a3a62bc14c88105315220c733fe6c2229ba904`.
Addresses below are module-relative RVAs, never captured process addresses.
Names are inferred from instructions and callers, not recovered debug symbols.
The game executable is not included in this repository or build artifacts.

| RVA | Observed behavior |
| --- | --- |
| `0x2E87B0` | Takes skill controller in RCX and rarity int in EDX. Writes through skill+0x68; synchronizes the hero's talent slot state; tail-calls rarity publication. |
| `0x2E9940` | Publishes the integer rarity and four Common/Rare/Epic/Legendary boolean signals at skill+0x100/+0x120/+0x140/+0x160/+0x180. |
| `0x26EC60` | Dispatches integer signal listeners. |
| `0x2AF150` | Dispatches boolean signal listeners. |
| `0x75B810` | Changes a selector case, disconnects the old output listener, connects/evaluates the new output and broadcasts it downstream. |
| `0x2E8AB0` | Temporarily publishes next rarity while formatting a preview, then republishes the original rarity. It is **not** the upgrade setter. |

The Airbender report confirms skill+0x68 points at the same persistent +0x50
field the old editor changed. The missing mechanism is notification, not a
second rarity integer. Selector+0x88 is an `EntityCpntValueSignal`, not a boxed
count; +0x90 is its listener-vector pointer. The disproven raw cache writer
has been removed. Selector+0x80 remains read-only diagnostic evidence.
Runtime +0x1B0/+0x1C8 are observer-vector lengths, not dirty or rarity fields.

Airbender GUID: `4e07fac065253a46a7418d70654504f2`.
Thirst for Immortality GUID: `717e49d62fdb8d4bad49eb879056b1e4`.
Display names are resolved from localized settings/runtime text; GUIDs are
the stable talent identifiers. The `thirst` shortcut remains supported.

## Read-only diagnostics

```powershell
npm run edit:talents -- Airbender legendary --inspect
npm run probe:talents -- talent-rarity-capture-airbender.jsonl --deep
```

The first saves `airbender-live-layout-<timestamp>.json`, including selector
cases and bounded linked objects. The second records labelled snapshots:
`before`, `idle`, a normal in-game upgrade, `after`, `idle-after`, then `q`.
Unreadable nodes and truncation are reported. Logs are ignored by Git.
`--inspect` cannot be combined with `--apply`. Captures never write memory.

Tests use synthetic memory and a disposable Windows fixture process. The
native integration test checks target-thread dispatch, stale rejection and
pending-timeout cancellation; it does not attach to Ravenswatch. Do not merge
or present this experiment as a verified gameplay feature until a live effect
change and continued run behavior have been observed.
