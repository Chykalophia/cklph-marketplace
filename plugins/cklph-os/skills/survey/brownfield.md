# Brownfield survey — inherited a client site or repo

Lazy depth for `survey`. For a new client handing over a codebase, a WordPress site someone else
built, or our own project after a long gap. Output: a **gap register** with evidence, triaged, so
the first feature doesn't land on top of a problem nobody wrote down.

**Audit first, fix later.** Fixing during the audit corrupts the baseline and mixes "what we
found" with "what we changed." Hold every fix for the register. Exception: an active security
exposure (a leaked key, an open admin) goes to the client today, then into the register as done.

## 0. Pick the slice
Don't map the whole repo. Start from what the client cares about today:

| Signal | Slice |
|---|---|
| Names a page, flow or feature | The files that implement it, traced from the entry point |
| Names a bug or complaint | The code that produced it, plus one level of callers |
| Names a plugin, dependency or vendor | Everything that touches it |
| Names nothing | The 2-3 hottest paths by churn (`git log --format= --name-only \| sort \| uniq -c \| sort -rn \| head`); propose, let them pick |

Budget about 15 files or 2,000 lines per slice; cut bigger ones into named sub-slices. Write the
perimeter (paths, entry points, callers) at the top of the register before anything else.

## 1. Present state, with evidence
- **Fingerprint:** framework and version, hosting (Vercel, Hetzner/Docker, managed WP host),
  database, package manager, CI, how it deploys today.
- **Run what exists, carefully.** An inherited repo's scripts are untrusted code. Read them first
  (`package.json` scripts and install hooks, `composer.json`, Makefile, CI config). Everything
  below, installs included, runs **only in a disposable sandbox**: a container holding a sanitized
  copy of the repo (no `.env*`, no credential or auth config files such as `.npmrc` tokens or
  `auth.json`), no host directories or credential stores mounted, no secrets in its environment,
  and network off except for the install step. Removing secrets alone is not isolation: the
  scripts can still read and change whatever the process can reach. No sandbox available: record
  these checks as not run, and say why. Install with lifecycle scripts off (`npm ci
  --ignore-scripts`, `pnpm install --ignore-scripts`; Yarn 1 `--ignore-scripts`, Yarn 2+
  `--mode=skip-build`; `composer install --no-plugins --no-scripts`). A package that needs its
  install script (Prisma generating its client, for one) then fails: a finding about the install,
  not a gap in the code. `pre`/`post` scripts still run with `npm test`, so read them too. Then
  type-check, lint, tests and build. Anything that phones
  home, touches a real database or needs production credentials: stop and get the go-ahead.
  Record counts and failures, don't fix them.
- **Review the slice:** `cklph-reviewer` on the slice; `security-hardening` if it touches input,
  auth or data. Deeper: `/cklph-audit:quick <lens> [path]` (e.g. `security`). Next.js + Supabase specifics: `cklph-nextjs` skills.
  WordPress: plugin and theme versions, custom code in `functions.php` / mu-plugins, page builder.
- **Inventory:** `TODO` / `FIXME` / `HACK` inside the perimeter; env vars referenced but undocumented.

## 2. Work backward
- `git log --oneline -- <slice>`: age, authors, cadence. Largest and reverted commits show where the
  design changed under pressure. Churn hotspots show where it still hurts.
- **Decision inventory:** the choices frozen into the code (framework, data model, auth, state
  management, error strategy, hosting). Check each for a written record (README, ADR, comments).
  A decision with no record is a gap on the Thinking axis. Don't silently backfill it.
- No git history (a site handed over as a zip or a host backup)? Say so. That is itself a Thinking gap.

## 3. The gap register (four axes)
| Axis | Question | Typical sources |
|---|---|---|
| **Thinking** | What was decided but never written down? Which rules live only in code? | Decision inventory, behavior nobody can explain |
| **Coding practice** | Where does the code differ from how we'd write it? | Review findings, untested paths, swallowed errors, secrets in code |
| **Missing features** | What would a day-one build have had? | Input validation, authz/RLS, backups, observability, rate limits, migrations + rollback, a11y, staging env, CI gates |
| **Technology** | Is the tech fighting the project? Outdated, duplicated, abandoned, risky? | Dependency ages, EOL versions, three form plugins doing one job, a page builder on a high-traffic page |

```markdown
| ID | Axis | Gap | Evidence | Forward fix | Sev | Effort | Status |
|----|------|-----|----------|-------------|-----|--------|--------|
| G-001 | Coding practice | Errors swallowed in checkout retry | src/lib/retry.ts:42 | Propagate, map at the boundary | P1 | S | open |
```
- **Severity:** P0 security exposure or data loss · P1 correctness · P2 practice, observability · P3 tech cleanup.
- **Effort:** S under a session · M a few sessions · L needs its own `spec` and `plan`.
- **Status:** open · in-progress · done · wont-fix (with the reason; a silent wont-fix reopens the gap).
- **Every row has an evidence pointer.** A gap you can't point at is an opinion; drop it or go find the evidence.

## 4. Triage and hand off
- Each row: **fix-forward**, **rewrite**, or **leave documented** (wont-fix with a reason).
  Rewrites and technology swaps are one-way doors: run `decide`.
- Sequence: P0 first, then quick wins between the larger repairs.
- Get the client's (or Peter's) go-ahead before any rewrite, migration or vendor change. The
  register is evidence for that conversation, not a work order.
- Backfilled decisions are marked as reconstructed, with today's date. Never present them as if they
  were written when the decision was made.
- Each actionable row (fix-forward or rewrite) then runs the normal loop: `spec` → `plan` → `build` → `review` → `verify`. For a legacy
  gap the first test usually encodes the rule that was only in the code. Wont-fix rows skip the
  loop: they close with their reason.
- The survey itself ends here: `## SURVEY COMPLETE` once every row is triaged and any go-ahead it
  needs (rewrite, migration, vendor change) is in, `## SURVEY OPEN` while any triage call or go-ahead is pending.

## 5. Close the loop
When every row is done or wont-fix, rerun step 1 on the same perimeter and diff it against the
first pass. Gaps that came back become new rows. Closure is verified, not declared.

Where it lives: in the client's repo as `docs/retro/<slice>/gap-register.md` if they want it; else
in our private notes for that client. Never in a public repo.
