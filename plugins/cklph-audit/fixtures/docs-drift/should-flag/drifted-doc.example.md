<!-- FIXTURE — docs-drift lens · should-flag (RECALL)
Planted drift — exactly three tokens the tool must report as exists:false and the lens MUST flag:
  1. path — the doc points contributors at a backticked mailer file under a src.utils folder
     that does not exist under the fixture root. Real-world shape: the file moved and the doc
     never followed.
  2. script — the doc tells contributors to run a build script (name ends in :prod) that was
     renamed; nothing resolves it. There is no package.json at the fixture root, which yields
     the same exists:false signal a renamed script produces in a real repo.
  3. package — the doc claims shared helpers come from a scoped package (@cklph scope) no
     dependency block declares. Same missing-package.json degradation: dep_exists resolves
     false, the signal a removed dependency produces in a real repo.
Root mapping: backtest runs docsdrift.sh with repo-root mapped to this lens's fixture folder
(the PARENT of the should-flag and should-not-flag subfolders), so every token below is
checked relative to that folder — not the plugin repo. The sibling reference in the last
paragraph DOES resolve, proving the tool reports mixed results and the lens flags only the
drifted rows. Expected verdict: FLAG all three planted tokens, severity LOW (no security
control is misled). -->

# Contributor guide (fixture — drifted)

Outbound mail templating lives in `src/utils/mailer.ts`; edit the subject map there before
touching any queue code.

Before opening a PR, build with `pnpm run build:prod` and attach the output to the PR
description.

Shared template helpers come from `@cklph/nonexistent-pkg` — import from there instead of
copying the formatting code.

Ground-truth labels for this lens live in `should-not-flag/accurate-doc.example.md`.
