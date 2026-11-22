# Third-party notices

## Cloudflare security-audit skill

`agents/red-team.md` (the boundary-and-result rule and the delegation and data-copy checks) and
`skills/security-hardening/SKILL.md` (the copies-of-data, model-feature, webhook, auth-flow and
spend checks, the "Is it a real finding?" test, and the severity anchors) adapt ideas from
https://github.com/cloudflare/security-audit-skill, commit
c1c8a8c1471069fb0e188eeaff69b8e8db6564a8.

Copyright (c) 2025-2026 Cloudflare, Inc. Licensed under the MIT License:

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

## Other sources (0.17.1)

`agents/cklph-reviewer.md`, `agents/red-team.md` and `skills/security-hardening/SKILL.md` also
adapt, in our own words: Supabase rules from supabase/agent-skills (MIT, commit c9be0e9); trust
precedents from anthropics/claude-code-security-review (MIT, commit 0c6a49f); the two-pass trace
and finding gate from google gemini-cli-extensions/security (Apache-2.0, commit 2227f3c). Ideas
only, no text: trailofbits/skills (CC BY-SA 4.0: removed-guard checks, chain check, restate the
claim), the OWASP Next.js cheat sheet (CC BY-SA 4.0), promptfoo (test weakening).

## Anti-slop sources (0.18.0)

`skills/frontend-ui/references/ai-tells.md` and `skills/frontend-ui/SKILL.md` adapt, in our own
words: the honesty rules, the brand-collision record and the ways to open a section from
Nutlope/hallmark (MIT, commit 04977e1); the eight tells marked ◇ from yetone/kill-ai-slop
(Apache-2.0, commit f6e2ae3). `agents/cklph-reviewer.md` and `agents/red-team.md` adapt the
fail-visible bias and closed justification loops from MrZoyo/deslop-GPT (MIT, commit 3913d8a).
Ideas only, no text copied.
