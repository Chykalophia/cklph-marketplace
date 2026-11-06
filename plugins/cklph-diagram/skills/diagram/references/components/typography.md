# Type scale
Three weights, four sizes. Four is a ceiling; most diagrams need three.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| `display` | 30–34px | 600 | −0.022em |
| `title` | 18–20px | 600 | −0.012em |
| `body` | 15–16px | 400 | 0 |
| `label` | 12–13px | 500 | +0.12em, uppercase |

## Rules

- **12px is the floor, measured rendered, not authored.** An 8px label in a
  1000-unit viewBox shown at 720px renders at 5.8px. `lint-a11y.py` A5 checks
  the rendered value.
- **Tabular numerals for every metric.** Proportional figures will not align in
  a column, and misaligned numbers read as careless faster than anything else.
- Tracking tightens as size grows and opens as size shrinks. Label-size type
  needs positive tracking to stay legible.
- Mono is for technical content — ports, commands, URLs, field types, IDs.
  Human-readable names go in the sans face.
