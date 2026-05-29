---
name: security-hardening
description: Security review checklist. Pull in during review or before shipping when changes touch user input, auth/authz, secrets, file/DB/network I/O, or external APIs.
---

# security-hardening — checklist

- **Input** — validate/escape at every boundary; parameterized queries (no string-built SQL); guard
  against injection (shell / SQL / XSS / path traversal).
- **AuthZ** — every mutation checks the actor; no IDOR; least privilege; correct client/role
  (e.g. service-role only after an admin check, never in a normal request path).
- **Secrets** — none in code, logs, or error messages; sourced from env / secret store; never echoed.
- **Data** — no sensitive data / PII in logs; safe defaults; correct encryption at rest/in transit.
- **Deps & headers** — no known-vuln dependencies; security headers where relevant.

Report findings by severity with `file:line` + fix (feeds the reviewer's security axis).
