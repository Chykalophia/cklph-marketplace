Adapted from ECC (https://github.com/affaan-m/ECC), skills/ai-regression-testing, commit 25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b.
Copyright (c) 2026 Affaan Mustafa. Licensed under the MIT License (full text below).
Modified by Chykalophia for the cklph stack.

Scope: only `ai-regression.md` in this folder came from that source; `SKILL.md` is original apart
from the one paragraph that points to it. Kept: the write-then-self-review blind spot, tests and
build before review, test where bugs were found, the four regression patterns and the null-cast
row, naming tests after the bug, and not skipping the mock path. Changed: the sandbox-mode-first setup became "real Supabase by default, mock mode is a second
path to test"; the sandbox/production pattern was widened to any parallel paths; `select("*")` as
the fix became a presence assertion plus regenerated types; "don't test code that never had a bug"
became "contract tests grow where bugs were found; the house smoke tier still applies"; the
`'field' in data` check became `not.toBeUndefined()`. Added: failures expressed through the mocked
`lib/data/` hooks, a pointer from the optimistic-rollback row to `click-path-audit`'s fix rules, in place of
upstream's whole-list rollback example (which `click-path-audit` names as a bug); resolve-then-reject for
the error-leakage test; a rendered-fallback test for the null-cast row; `@supabase/ssr` cookies for
route tests, request context for `compose()`d
routes, the reinjection step, the `Pick<>` link to `pitfalls`, and the "assert a guard exists" and
"don't update a failing assertion" don'ts. Not ported: the Vitest config, request helper,
`/bug-check` command text, the Priority column, "write the test before the fix", "keep tests under
1 s" and "don't write integration tests when unit tests suffice" (the house default is a real
Supabase branch).

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
