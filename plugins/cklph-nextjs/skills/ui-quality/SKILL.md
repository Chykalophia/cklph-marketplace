---
name: ui-quality
description: Peter's dark-mode + WCAG AA discipline for every UI change. Use when writing any component, page, modal, form, skeleton, or interactive element — and any time the word "accessibility", "dark mode", "contrast", "ARIA", "focus", or "keyboard" comes up.
---

# ui-quality — dark mode + WCAG AA

`discipline` says "dark mode and WCAG AA on every new UI." This skill is the how.

## Pair every color with a dark variant — no exceptions

```
❌ bg-white                    → flashes in dark mode
❌ bg-gray-200 animate-pulse   → skeleton flashbang
✅ bg-white dark:bg-neutral-900
✅ bg-neutral-200 dark:bg-neutral-700 animate-pulse
```

Skeletons, modals, dropdowns, tooltips, shadows, focus rings — every one needs a `dark:` pair. No counterpart = incomplete diff.

| Light | Dark |
| --- | --- |
| `bg-white` | `dark:bg-neutral-900` |
| `text-neutral-900` | `dark:text-neutral-100` |
| `text-neutral-600` | `dark:text-neutral-400` |
| `border-neutral-200` | `dark:border-neutral-700` |
| `placeholder-neutral-400` | `dark:placeholder-neutral-500` |

## Contrast

- **4.5:1** for normal text, **3:1** for large text (18px+ / 14px+ bold) and UI/icons.
- Check **both modes** with axe DevTools or the WebAIM checker. Muted text on dark backgrounds is the most common failure.

## Focus management

- Visible `:focus-visible` ring on every interactive element.
- **Never `outline: none` without a styled replacement** — it's an a11y regression no matter how clean it looks.
- Modals trap focus and return it to the trigger on close.

## Keyboard navigation

Tab order matches visual layout. **Enter** activates buttons/links; **Space** activates checkboxes/toggles. **Escape** closes modals, dropdowns, popovers. **Arrow keys** move within groups (tabs, menus, radios). Custom-role buttons on `<div>` need explicit `onKeyDown` — or just use a real `<button>`.

## ARIA — only where semantic HTML can't

- **Icon-only buttons**: `aria-label="Save"`.
- **Toasts**: `role="alert"` (urgent), `aria-live="polite"` (status).
- **Modals**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- **Expandables**: `aria-expanded`, `aria-controls`.
- **Field errors**: `aria-describedby` on the input, `aria-invalid={true}` on error.

Don't add `role` when semantic HTML already covers it — `<button role="button">` is noise.

## Color is never the only signal

Pair color with an icon and text — red border + alert icon + error text, green check + success text. Users who can't distinguish red and green must still read the state.

## Touch targets

Minimum **44 × 44 px** (WCAG 2.5.5). `p-1 text-xs` "×" buttons fail.

## Screen-reader smoke-test

Run the primary flow through VoiceOver (Cmd+F5) or NVDA before shipping. **Can a screen-reader user finish?** Missing labels and broken focus order surface in 30 seconds.

## Anti-patterns

- Tailwind color classes without `dark:` pairs.
- `outline: none` with no replacement focus style.
- `onClick` on a `<div>` with no `role` or keyboard handler.
- Color-only error/success states; placeholder text used as a label.
- Skeletons using bright light-mode grays in dark mode.
- Skipping heading levels (h1 → h3 with no h2).

Pair with **discipline** for the rule it extends, **component-standards** for the underlying primitives.
