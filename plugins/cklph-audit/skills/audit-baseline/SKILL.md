---
name: audit-baseline
description: Accept currently-open audit findings into .audit-baseline.json with a per-finding reason, so re-runs show only NEW findings and accepted debt never resurfaces.
---

# audit-baseline

Make accepting tech debt a **deliberate, annotated act**. This skill turns the findings currently open in the repo (from the latest `AUDIT-<date>.md`) into entries in `.audit-baseline.json`, each carrying a human reason — the equivalent of the CASA "deferred to H-8 (tracked)" notes.

## Inputs

- The latest report under `<report.dir>/AUDIT-<date>.md` (default `audits/`), OR the confirmed-fresh findings from a just-completed `:run`.
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

## Guarantees

- **Read-only on application code.** The only write is `.audit-baseline.json`.
- **No silent acceptance.** Every accepted finding has a `reason` and a `by`.
- **Idempotent.** Re-running offers only findings not already in the baseline.
- A subsequent `:run` suppresses any fresh finding whose fingerprint is baselined and notes the suppressed count in the report.
