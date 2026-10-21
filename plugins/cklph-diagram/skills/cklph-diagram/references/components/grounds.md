# Ground treatments
Untreated white is the loudest signal of a default export.

| Treatment | Implementation |
|---|---|
| off-white | never `#ffffff`; a warm or cool off-white |
| dot grid | 16–24px pattern, dot radius ~1.4, ≤10% opacity |
| line grid | 24px, ≤2.5% opacity — the Vercel register |
| radial wash | one soft radial behind the focal area, ≤16% |
| grain | fractal turbulence, alpha ≤0.06 |

## Rules

- **Never pure `#ffffff` or `#000000`.** Pure white causes glare; pure black
  causes halation against light text.
- **Keep grid and wash under ~10% opacity**, and check text contrast against the
  *treated* ground, not the base colour.
- **A filtered rect must carry an explicit `fill`.** A rect with a filter and no
  fill defaults to black; browsers hide this only because the filter replaces
  the source graphic. Any renderer that drops the filter renders a black slab.
- Grain adds visual noise by definition — never lay text on the grainiest area.
