# Brand onboarding

How a client goes from named to renderable. Until this flow completes, the
loader refuses the brand and the skill stops — see
[`brands/_template.md`](brands/_template.md).

Onboarding is **extraction, then verification, then a diff**. Never hand-fill a
brand file from memory of the logo. The colour you remember is almost never the
colour in the stylesheet, and the colour in the stylesheet frequently fails AA.

---

## 1. Extract

Fetch the site and every stylesheet it links. Look, in this order, for:

1. **CSS custom properties** — `--color-*`, `--brand-*`, `--theme-*`. This is the
   jackpot: a design system someone already named. Chykalophia's own tokens came
   from here, which is why `cklph.md` carries a `Provenance` column.
2. **Frequency-ranked hex values** in the compiled CSS. Rank them; the top
   handful minus the greys is usually the palette.
3. **`font-family` declarations**, including the display face.

```bash
curl -sL "$SITE" -o site.html
grep -oE 'href="[^"]*\.css[^"]*"' site.html          # find stylesheets
grep -oE '\--[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8}' *.css  # custom properties first
grep -oiE '#[0-9a-f]{6}' *.css | sort | uniq -c | sort -rn | head -20
```

### Three failure modes, all seen in practice

| What you find | What it means | What to do |
|---|---|---|
| A page under ~1 KB with a redirect script | Placeholder or lander, no design system | Stop. Leave the brand `stub`. Ask for a brand guide or a real staging URL. |
| Bootstrap defaults (`#337ab7`, `#a94442`, `#3c763d`) and a stock theme path | Off-the-shelf theme, not a brand | Stop. The one customiser colour is not a palette. Ask for source material. |
| A coherent 5–8 colour set plus fonts | Onboardable | Continue to step 2. |

Recording *why* a brand is blocked is part of the job. A stub that says "not yet
onboarded" teaches nobody; a stub that says "the site is a stock off-the-shelf
theme, its only brand token is a customiser blue" tells the next person exactly
what to go get. [`brands/_example-stub.md`](brands/_example-stub.md) is a worked
example of a blocked file.

## 2. Map to semantic roles

Copy [`brands/_template.md`](brands/_template.md) to `<client-slug>.md` and fill
it. Rules that matter:

- **Extracted beats derived; derived beats invented.** Mark every token's origin.
  Deriving a mid-tone inside an extracted hue family is fine. Introducing a hue
  the brand does not own is not — with one narrow exception: a categorical scale
  that needs a fifth separable hue. Say so in the file when you do it.
- **`accent` is a text role here.** It has to clear 4.5:1 on `paper`, because the
  skin uses it for 12px labels as well as fills. Brand accents frequently fail
  this. Darken the same hue until it passes and record the substitution in the
  file. A typical brand orange, `#e2622a`, is 3.34:1 on a `#fafaf7` ground — fine
  as a large fill, a fail as a 12px label. Held at the same hue and darkened to
  `#b4480f` it reaches 5.18:1 and passes. Ship the original in marketing; use the
  darkened value for `accent`. If the client pushes back, the answer is that the
  label has to be legible — the swatch does not have to match the hero image.
- **`paper` is never pure `#ffffff`.** See [`cognitive-load.md`](cognitive-load.md) C5.
- **Fill both modes.** A brand with no dark tokens is half a brand.

## 3. Verify — mechanically

```bash
python scripts/brand-tokens.py <slug> --check
python scripts/brand-tokens.py <slug> --check --mode dark
```

This is not advisory. It checks every text role against its ground at 4.5:1,
meaningful borders at 3:1, sequential ramps for monotonic luminance, and
adjacent ramp steps for separation. Fix the tokens until both modes are clean.
A brand that cannot pass is not ready to ship, no matter how much the client
likes the swatch.

## 4. Diff, then commit

Show the proposed file before writing it. Flip `status:` from `stub` to `live`
only after `--check` passes in both modes, then prove it end to end:

```bash
python scripts/build-examples.py --brand <slug> --out out/
python scripts/lint-a11y.py out/*-<slug>-light.html --brand <slug>
```

## 5. The guardrail

The loader refuses any brand whose `status` is `stub` or that still contains a
`TODO`, and it never falls back to CKLPH tokens when a named client's brand is
missing. That refusal is the whole point: the failure this prevents is a
CKLPH-skinned diagram landing inside a client deliverable, where nobody catches
it until the client does.
