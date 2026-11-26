---
name: audit-baseline
description: Accept currently-open audit findings into .audit-baseline.json with a per-finding reason, so re-runs show only NEW findings and accepted debt never resurfaces.
---

# audit-baseline

Make accepting tech debt a **deliberate, annotated act**. This skill turns the findings currently open in the repo (from the latest `AUDIT-<date>.md`) into entries in `.audit-baseline.json`, each carrying a human reason — the equivalent of the CASA "deferred to H-8 (tracked)" notes.

## Inputs

- The latest report under `<report.dir>/AUDIT-<date>.md` (default `audits/`), OR the confirmed-fresh findings from a just-completed `:run`. "Latest" means the most recently modified `AUDIT-*.md` whose front-matter is not `result: clean`: a clean-run record (`AUDIT-<date>-clean.md`) has no findings to baseline, and same-day reruns are written as `-2`, `-3`, so never pick by file name alone.
- The existing `.audit-baseline.json` (created empty by `:init`).

## Procedure

1. **Load** the open confirmed findings. Skip anything already baselined (fingerprint match) — only un-accepted findings are offered.
2. **Walk each finding interactively.** Show `severity`, `title`, `file:line`, the snippet, and the one-line rationale. For each, prompt:
   - **accept** → ask for a free-text `reason` (required; "why is this OK to defer / why is it a known exception"). Capture the author (`by`).
   - **skip** → leave it open (it will re-surface next run).
   - **accept-all** → apply one shared reason to the remaining findings (use sparingly; per-finding reasons are better).
3. **Compute the fingerprint** for each accepted finding = stable hash of `{ rule, file, normalizedSnippet }`. Normalize whitespace + identifiers so trivial edits don't change it; **line numbers are NOT in the hash**, so the fingerprint survives code moving up or down.
4. **Write** the merged set back to `.audit-baseline.json`:

```json
{
  "version": 1,
  "acceptedAt": "<ISO date>",
  "findings": [
    {
      "fingerprint": "a1b2c3…",
      "rule": "ASVS-4.2.2",
      "file": "lib/hooks/use-dashboard-data.ts",
      "title": "Direct Supabase reads bypass lib/data",
      "reason": "Deferred to H-8 (tracked)",
      "by": "peter"
    }
  ]
}
```

5. **Report** how many findings were accepted, how many were skipped (still open), and the file path written. Commit `.audit-baseline.json` so the next `:run` is delta-only.

## The tested-clean ledger, its counterpart

The baseline records findings you **accepted**. `.audit-ledger.json`, written by `:run` through `tools/ledger.mjs`, records what was **reviewed and found clean**: one entry per (lens, file) with the file's blob hash, the commit and the date. A file stays covered only while its content is unchanged. `ledger.mjs status --repo .` reports covered, changed and never-reviewed files per lens; `/cklph-audit:run --skip-covered` hands the covered ones to the reviewers to skip. A baselined finding keeps its file off the clean list: accepted debt is not clean ground. The ledger is capped (`ledger.maxBytes`, default 1 MB) and rotates its oldest entries into `.audit-ledger.1.json`, held to the same cap. Commit both files with the baseline.

## Guarantees

- **Read-only on application code.** The only write is `.audit-baseline.json`.
- **No silent acceptance.** Every accepted finding has a `reason` and a `by`.
- **Idempotent.** Re-running offers only findings not already in the baseline.
- A subsequent `:run` suppresses any fresh finding whose fingerprint is baselined and notes the suppressed count in the report.
