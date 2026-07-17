<!-- FIXTURE — docs-drift lens · should-not-flag (PRECISION)
Clean look-alike: this doc makes the SAME kinds of claims as the drifted sibling — backticked
file paths, globs, bare dir refs — but every token resolves. The tool must report every row
as exists:true and the lens must flag nothing; the verifier should refute any finding here.
Root mapping: backtest runs docsdrift.sh with repo-root mapped to this lens's fixture folder
(the PARENT of the should-flag and should-not-flag subfolders), so the references below are
written relative to that folder and all exist on disk. No script or package tokens on
purpose: the fixture root has no package.json, so an accurate doc here cannot truthfully
reference one. Expected verdict: DO NOT FLAG. -->

# Contributor guide (fixture — accurate)

Recall fixtures live under should-flag/ and precision look-alikes under should-not-flag/ —
see `should-flag/drifted-doc.example.md` for the drifted twin of this file.

Every markdown fixture for this lens matches `should-flag/*.example.md` or
`should-not-flag/*.example.md`; keep that naming so real build globs never pick a fixture up.

This file is `should-not-flag/accurate-doc.example.md`.
