# fixtures — ground truth for lens validation

No lens ships on vibes. Every lens is measured against **labeled ground truth** before it
is trusted (SPEC §10). These fixtures are that ground truth, run by
`/cklph-audit:backtest <lens>` (the `audit-backtest` skill).

## Layout

```
fixtures/
└── <lens>/                         # security | correctness | architecture | docs-drift | omission | agent-config | ambiguity | …
    ├── should-flag/                # planted issues the lens MUST catch   → RECALL
    └── should-not-flag/            # clean look-alikes it MUST NOT flag   → PRECISION
```

- **`should-flag/`** — files containing a *real* instance of what the lens hunts. Each is a
  known **true positive**. If the lens misses one, that's a **false negative** → recall drops.
- **`should-not-flag/`** — files that *look* like a problem but are genuinely fine (the
  classic trap: code that is structurally similar but not actually a defect). If the lens
  flags one and it survives verify, that's a **false positive** → precision drops.

## The gate

The backtest harness runs the lens (reviewer → verifier, the same pipeline as `:run`) over
both folders and computes:

- **recall** = TP / (TP + FN)   — *did it catch the planted issues?*
- **precision** = TP / (TP + FP) **after verify**   — *did it avoid the look-alikes?*

A lens is **gated** — not enabled until it clears the suggested threshold:

> **recall ≥ 0.8** and **precision ≥ 0.7 after verify**

A lens that can't clear the gate gets its tool / prompt / verifier fixed first. It does not
ship degraded.

## Fixtures grow over time

Every time a real false-positive or false-negative is found in the wild, add it here as a new
fixture (a look-alike → `should-not-flag/`, a missed defect → `should-flag/`). The gate
**ratchets up** as the corpus grows — the lens can only get more trustworthy.

## Naming

Use `<short-description>.example.ts` so fixtures are never picked up by the repo's real
build/test globs. Comment each fixture with **what** is planted (or why it's clean) and the
**expected** verdict, so the labels are self-documenting.

`docs-drift` fixtures are markdown — `<short-description>.example.md` — and their references
are written relative to `fixtures/docs-drift/` (the parent of both subfolders): the backtest
runs `docsdrift.sh` with that folder as its repo-root, so tokens resolve (or drift) against it,
not against the plugin repo.

`agent-config` fixtures keep a real config's shape but never its real name: `*.example.mcp.json`,
`*.example.settings.json`, `*.example.hooks.json`, `*.example.md`, so no tool loads them as live
config. JSON can't hold comments, so the label sits in a top-level `_fixture` key. Never execute a
fixture's commands; the lens is static.

`omission` (the opt-in negative-space lens, v3) uses the same `.example.*` convention. Its corpus
is newer and still growing, so `fixtures/omission/` may lag the shipped lens — a docs/fixtures
drift to close over time: add planted omissions (missing validation / error-path / rollback / log /
test) to `should-flag/`, and clean guarded look-alikes to `should-not-flag/`, as you exercise it.

`ambiguity` (the opt-in lens for text a reader can take two ways, v4) is laid out differently:

- **Each case dir is a mini repo root.** `fixtures/ambiguity/should-flag/<case>/` and
  `should-not-flag/<case>/` hold the doc(s) plus the schema or consumer they are checked against.
  The backtest runs `ambiguity.sh` and the engine with the case dir as the root, so a case never
  sees the plugin's own schemas.
- **Every file is named `*.example.*`**, so no fixture matches a default prose glob
  (`SECURITY.example.md` is not `**/SECURITY.md`) and an ordinary audit's walk skips it.
- **docClass comes from the path.** A file whose expected rule needs the `instruction` class
  (vague-conditional, overloaded-term, a contradiction between an agent and the skill it loads) lives
  under `agents/` or `skills/` inside its case dir. `release.example.md` at the case root is a
  `reference` doc, and the lens could never flag those rules there.
- **Labels live in the `fixtures/ambiguity/labels.json` sidecar**, not in the files. Each file's
  first line is an empty comment (`<!-- -->` in md, `//` in js/ts) that only keeps label line
  numbers stable: no case id (F/N/C is the verdict), no labels path (the answer key) and no
  `FIXTURE` marker (the lens skips `fixtures/**` as ground truth, which would bias the panel), since
  the reviewer reads comments as evidence. No fixture sentence may appear in the lens SKILL or an
  agent def (AC-041 checks 4-word runs). The LLM gate also runs each case from a neutral copy whose
  path carries no `should-flag` / `should-not-flag` segment, inside a throwaway gate tree with
  `fixtures/ambiguity/` deleted (see `audit-backtest`). This lens
  does not use in-file verdict headers because for ambiguity the label *is* the answer: writing the
  two readings into the file disambiguates it, and a comment naming a unit is itself the
  disambiguator the reviewer is told to read. So no fixture file says which verdict it expects or
  spells out its readings. Label line numbers count the header line, and the answer key is derived
  by hand from the planted text, never copied from the tool's output.
- **The Acme rule.** Never name a real third-party product in a fixture: the SECURITY.md cases are
  anonymized to "Acme".

---

### Example: the architecture (DRY) distinction

The hardest part of a DRY lens is telling **duplicated knowledge** (extract it) from
**coincidental similarity** (leave it alone). The shipped example pair shows both sides:

- `architecture/should-flag/duplicated-knowledge.example.ts` — two functions that encode the
  **same business rule** in two places. Change the rule and you must edit both → a real DRY
  defect. The lens **must** flag this.
- `architecture/should-not-flag/coincidental-similarity.example.ts` — two functions with the
  **same shape** but **unrelated knowledge**. They look alike today by accident; coupling them
  would be wrong. The lens **must not** flag this.
