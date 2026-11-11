# Animated component libraries: what we've checked

Names, links and notes only. Two of these libraries are MIT plus Commons Clause, which allows using a
component inside a client site or app but not redistributing the component source. So never copy
their code into this marketplace, a shared package of ours, or a template we hand out. Install per
project, from the library's own registry.

Last checked 2026-11-11 on Next 16.4, React 19.3, Tailwind 4.3. Sizes are the gzip cost added to one
route. Re-check a component before using it: coverage varies inside each library.

| Library | Licence | Verdict | Notes |
| --- | --- | --- | --- |
| [React Bits](https://github.com/DavidHDev/react-bits) | MIT + Commons Clause; paid Pro tier | Use, per component | No dependencies, about +3 kB. Most components handle reduced motion, not all (BorderGlow doesn't). Correct output without JS. `SpotlightCard` trips the React Compiler `react-hooks/refs` lint rule. |
| [Canvas UI](https://github.com/DavidHDev/canvas-ui) | MIT + Commons Clause | One showcase section at most | WebGL effects, no dependencies, about +4 kB. Handles reduced motion and renders plain content without JS. In Chrome it moves the wrapped content into a canvas after load, which resets any state inside it. Built on an experimental Chrome API. Marketing pages only, never app UI or forms. |
| [Magic UI](https://github.com/magicuidesign/magicui) | MIT | Rebuild what you need | Pulls in `motion` (+14.5 kB for one counter). Only 6 of 80 components mention reduced motion; `number-ticker` ignores it and renders "0" before JS runs. Hard-coded colour classes break token lint. The MIT code is fine to read and rewrite in CSS. |

## Installing one

```bash
npm_config_ignore_scripts=true npx -y shadcn@4.23.0 add <registry-url-or-name> --yes
```

- Read the registry JSON first. Check every new npm dependency (`npm view <pkg> repository license`).
- Write `components.json` by hand in an existing project: `shadcn init` rewrites `globals.css`.
- Magic UI imports `cn` from `@/lib/utils` without declaring it. Add `clsx` and `tailwind-merge`.
- Keep the library's copyright notice in the file.

## Before it ships

Run the three checks in `cklph-os:frontend-ui` (`references/motion.md`): reduced motion, correct
no-JS output, and the gzip size cost. Note the size in the PR.
