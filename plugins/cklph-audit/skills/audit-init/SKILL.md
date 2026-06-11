---
name: audit-init
description: One-time scaffold for a repo's audit state — detect subsystems and write audit.config.yaml (tailored to the repo) plus an empty .audit-baseline.json. Invoked by /cklph-audit:init.
---

# audit-init — scaffold audit.config.yaml + .audit-baseline.json

This skill is what `/cklph-audit:init` delegates to. It is a **one-time** scaffold: it inspects the target repo, writes a tailored config, and seeds an empty baseline. After this, the repo is ready for `/cklph-audit:run`.

## STRICT: writes exactly two files

You may write only:
1. `<repo>/audit.config.yaml`
2. `<repo>/.audit-baseline.json`

No application code. Read freely to detect structure.

## Steps

### 1. Refuse to clobber

If `audit.config.yaml` already exists in the repo root, stop and tell the user it's already initialized — point them at `/cklph-audit:run`. Don't overwrite a config the user may have hand-tuned (units, ignore globs, budget). Offer to show the existing file instead.

### 2. Detect subsystems

Map the repo's top-level structure so the config's example units actually match this codebase:

- List the top-level directories (`app/`, `lib/`, `components/`, `src/`, `packages/`, etc.) and any route tree (`app/api/**`, `pages/api/**`).
- Identify high-risk surfaces to seed as units: **auth** (`lib/auth`, `app/api/auth`, middleware), **billing/payments** (`app/api/billing`, `lib/stripe`), **data mutation / webhooks**, **external I/O / cron**.
- Identify service/repository layers (`lib/services`, `lib/data`, repos).
- Read the repo's own rule files if present (`CLAUDE.md`, `AGENTS.md`, `.coderabbit.yaml`) so `rulesFrom` lists the ones that actually exist.
- Note conventional ignore targets: `**/__tests__/**`, generated files (`*.generated.ts`, `types/database.ts`), build output, fixtures.

This is detection for tailoring — keep it fast. You are not auditing; the scout does deeper unit inference at run time. Explicit `units.list` here is optional (the scout infers when it's absent), but seeding a couple of obvious high-risk units helps quick mode rank well.

### 3. Write `audit.config.yaml`

Start from `${CLAUDE_PLUGIN_ROOT}/templates/audit.config.example.yaml` and tailor it to what you detected:

- Set `lenses: [security, correctness, architecture]`.
- Seed `units.list` with the high-risk subsystems you found, with real `globs` for THIS repo (or leave `units.list` empty and `autoInfer: true` to let the scout infer — but always set the high-risk ones if obvious).
- Set `ignore` to the patterns that actually apply here.
- Set `rulesFrom` to the rule files that actually exist in the repo.
- Keep the template defaults for `verify.voters` (3), `severityFloor`, `budget`, `quick.topN`, `report.dir: audits`, `units.deepMapThreshold` (0.7).

Comment any unit/glob you inferred so the user can verify and pin it.

### 4. Write `.audit-baseline.json`

Write an empty, valid baseline:

```json
{ "version": 1, "findings": [] }
```

This is intentionally empty — the first `/cklph-audit:run` will surface existing tech debt, and `/cklph-audit:baseline` is how the user later accepts what they're deferring.

### 5. Report

Tell the user both files were created, list the units you seeded (so they can pin/adjust), and point them at:

> Next: `/cklph-audit:run security,correctness,architecture` — then `/cklph-audit:baseline` once you've triaged.

Remind them both files are meant to be **committed** (git-trackable audit state).
