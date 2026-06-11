# fixtures — ground truth for lens validation

No lens ships on vibes. Every lens is measured against **labeled ground truth** before it
is trusted (SPEC §10). These fixtures are that ground truth, run by
`/cklph-audit:backtest <lens>` (the `audit-backtest` skill).

## Layout

```
fixtures/
└── <lens>/                         # security | correctness | architecture
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
