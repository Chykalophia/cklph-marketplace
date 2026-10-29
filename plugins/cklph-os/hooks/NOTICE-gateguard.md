Adapted from ECC (https://github.com/affaan-m/ECC), skills/gateguard,
scripts/hooks/gateguard-fact-force.js and scripts/lib/gateguard-*.js, commit
25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b.
Copyright (c) 2026 Affaan Mustafa. Licensed under the MIT License (full text below).
Modified by Chykalophia for the cklph stack: a ~280-line bash hook (gateguard.sh) in place of the
~7,000-line Node original (the hook plus ten library modules).

Kept: deny-then-allow on the first Edit/Write/MultiEdit/NotebookEdit per file per session; the
questions by target class (instruction, test, prose, config, code); the sensitive file names and
path segments; judging sensitive targets on both the path as written and the real location (here
through the nearest existing directory, `pwd -P`); the subagent pass for ordinary files; operator path exemptions winning over
everything; the parallel-batch warning.

Changed: exit 2 with the reason on stderr instead of a JSON `permissionDecision`; state lasts about
3 days instead of 8 idle hours; one state file per session, so a subagent's retry on a sensitive
file also unlocks it for the parent; the instruction class covers `.claude`, `agents`, `commands`,
`skills`, `rules` and `hooks` directories, `.txt` only under `.claude` and `skills`, and
`copilot-instructions.md` by name (narrowed: not `.cursor`, `.codex`, `.opencode`, other
`.github/*instructions*.md` files, or `.mdx`); the Claude settings-file
exemption is narrowed to `.claude/settings.json` and `.claude/settings.local.json` at the project
root.

Added: off by default with an opt-in `sensitive` mode; `checkout`, `stripe` and the Next.js
`(auth)` route group as path segments, and the file stems `auth`, `stripe`, `billing`,
`payment(s)`, `checkout`, `middleware` and `proxy` (any extension) as sensitive; `~/.claude` never
gated; a denial log for the weekly review; fail-open on a missing session id, unreadable or
unwritable state, or a newline in any payload field; control characters stripped from the path in
the denial; pruning limited to the hook's own top-level files.

Not ported: the routine and destructive Bash gates (destructive-command-gate.sh covers the latter;
shell writes are not gated at all), transcript scanning for prior-search credit, change profiling,
comment-only passes, sibling collapse, denial caps, hard-link detection, "any error counts as
sensitive", symlinked-file (as opposed to directory) resolution, stripping a
`.claude/worktrees/<name>/` prefix before classifying (a worktree's README is classed as an
instruction file), and the replay evaluation harness.

The upstream A/B result (gated 9.0 vs ungated 6.75 over two tasks) belongs to the original; this
port has not been re-measured. See the denial log and the weekly review.

MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
