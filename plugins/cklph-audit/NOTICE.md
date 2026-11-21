# Third-party notices

## ECC

`skills/agent-config-lens` adapts material from ECC. Its notice and license are in
`skills/agent-config-lens/NOTICE.md`.

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
