# Third-party notices

## ECC

`skills/agent-config-lens` adapts material from ECC. Its notice and license are in
`skills/agent-config-lens/NOTICE.md`.

## Other security sources (1.5.0)

Rules and techniques below were rewritten in our own words for this plugin. None of the source
text is copied. Each source is credited with its license and the commit read on 2026-11-21.

Adapted (permissive licenses):

- supabase/agent-skills, `skills/supabase/SKILL.md`, MIT, commit c9be0e9:
  Supabase RLS, view, `SECURITY DEFINER` and `user_metadata` rules in `skills/security-lens`.
- anthropics/claude-code-security-review, MIT, commit 0c6a49f: trust precedents in
  `skills/trust-precedents`.
- google gemini-cli-extensions/security, Apache-2.0, commit 2227f3c: the not-a-finding gate in
  `skills/trust-precedents`.
- GitHubSecurityLab/seclab-taskflows, MIT: per-unit `intendedUse` in the threat model.
- getsentry/skills, `skills/secret-serialization`, Apache-2.0: `security:secret-serialization`.
- snyk/agent-scan, Apache-2.0, commit ebf2d6f: tool shadowing and skill content checks in
  `skills/agent-config-lens`.
- cisco-ai-defense/skill-scanner (Apache-2.0, commit c558c42) and cisco-ai-defense/mcp-scanner
  (Apache-2.0, commit 8c3cae1): skill content checks in `skills/agent-config-lens`, and the
  description-versus-behaviour check in `skills/llm-lens`.
- cosai-oasis/project-codeguard, CC BY 4.0, commit 1da7e10, "Project CodeGuard" by the Coalition
  for Secure AI (https://creativecommons.org/licenses/by/4.0/). Changes were made: the two-stage
  commit and approval-fatigue guidance in `llm:action-binding`, and npm install hygiene in
  `skills/supply-chain-lens`.

Ideas only (share-alike, copyleft, or unlicensed sources; no text adapted):

- trailofbits/skills (CC BY-SA 4.0, commit 149d7b2): restate-the-claim, variant search
  discipline, AI agents in CI, removed-guard checks.
- OWASP Cheat Sheet Series (CC BY-SA 4.0): Next.js, MCP and Secure Coding with AI cheat sheets.
- Theori RoboDuck, protectai/vulnhuntr, Team Atlanta Atlantis (AGPL or unverified): per-hop
  reachability conditions.
- promptfoo coding-agent plugins: test weakening.

## Cloudflare security-audit skill

Adapted from https://github.com/cloudflare/security-audit-skill, commit
c1c8a8c1471069fb0e188eeaff69b8e8db6564a8. Sources:

- `skills/security-audit/AI-AND-LLM.md` → `skills/llm-lens`
- `skills/security-audit/DATA-ISOLATION-AND-LIFECYCLE.md` → `skills/data-isolation-lens`
- `skills/security-audit/WEB-PROTOCOL-AND-AUTH.md` → `skills/web-auth-lens`
- `skills/security-audit/CLIENT-SIDE.md` → `skills/client-side-lens`
- `skills/security-audit/PROTOCOLS-RPC-AND-MESSAGING.md` → `skills/messaging-lens`
- `skills/security-audit/RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` → `skills/availability-lens`
- `skills/security-audit/SUPPLY-CHAIN-AND-RELEASE.md` → additions to `skills/supply-chain-lens`
- `skills/security-audit/CLOUD-AND-DEPLOYMENT.md` → additions to `skills/iac-lens`
- `skills/security-audit/SKILL.md` (core principles, severity anchors, anti-patterns) → additions
  to `skills/security-lens`, `agents/audit-reviewer.md`, `agents/audit-verifier.md` and
  `skills/audit-report-format`

Copyright (c) 2025-2026 Cloudflare, Inc. Licensed under the MIT License (full text below).
Modified by Chykalophia for the cklph stack: rewritten as cklph-audit lenses with rule ids,
`rg` recall, and the reviewer/verifier contract.

MIT License

Copyright (c) 2025-2026 Cloudflare, Inc.

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
