---
brand: _example-stub
label: Example Client (synthetic)
status: stub
aliases: [example client, example-client]
source: synthetic — this brand is deliberately un-onboarded
---

# Example Client — brand tokens

**This is not a real client.** It is a fixture: a deliberately blocked brand file
that exists so the refusal path stays under test in CI, and so you can see what a
half-finished onboarding actually looks like before you write your first real one.

`scripts/verify.sh` step 4 asserts that every brand marked `stub` exits non-zero
rather than rendering. Without at least one stub in the registry that check passes
vacuously — it iterates over an empty list and reports success — which would mean
the single most important guardrail in this skill was silently untested.

Try it:

```bash
python3 scripts/brand-tokens.py _example-stub --check   # exits 1, explains why
python3 scripts/build-examples.py --brand _example-stub --out out/   # refuses
```

## What the extraction found

The site yielded one usable colour and nothing else — no custom properties, no
coherent palette, no display face:

| Value | Where |
|---|---|
| `#1164f0` | theme customiser accent |
| `#eeeeee` | section ground |
| system-ui | body face, browser default |

One customiser colour is not a palette. Building a five-hue categorical scale and
two ramps off a single blue would be **inventing** a brand and then shipping it to
the client under their own name. That is the failure this file exists to prevent.

Deliberately absent: every core role, all three scales, and the typography table.
A brand file is not "nearly done" because it has some colours in it.

## To unblock

Get one of: a PDF brand guide, the logo source (`.ai` / `.svg` with named
swatches), or a URL for a site that actually carries the design system. Then
follow [`brand-onboarding.md`](../brand-onboarding.md) — extract, map, verify
mechanically, diff, and only then flip `status:` to `live`.

Do not hand-fill this from memory of the logo. Extract, check, then commit.
