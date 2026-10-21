# Gallery

Every exploration, rendered. These are **reference material**, not templates —
open them, pick what works, then look up the choices in
[`../skills/cklph-diagram/references/components/`](../skills/cklph-diagram/references/components/).

| Folder | What | Count |
|---|---|---|
| `themes/` | the 14 original themes, same diagram each | 14 |
| `forms/` | structural ideas — geometry, not skin | 10 |
| `ui/` | modern UI material + component specimen + line lab | 12 |
| `artdirected/` | eight style families, the nine fixes, before/after | 22 |

## Start here

- **`artdirected/41-before-after.html`** — the argument. Identical content,
  untreated vs treated. If a theme can't move the left side to the right, it
  isn't finished.
- **`ui/21-component-specimen.html`** — every node style, connector, endpoint,
  elevation step and junction on one sheet.
- **`ui/22-line-lab.html`** — 36 connector treatments, grouped by job.

## Regenerating

```bash
python3 scripts/build-themes.py            # gallery/themes
python3 scripts/build-form-explorations.py # gallery/forms
python3 scripts/build-ui-explorations.py   # gallery/ui (11-21)
python3 scripts/build-line-lab.py          # gallery/ui (22)
python3 scripts/build-artdirected.py       # gallery/artdirected
```
