# Two-reviewer gate

Lazy depth for `review`. One reviewer shares blind spots with whoever wrote the work; two
reviewers with no shared context break that. Both must pass.

## When (only these three)
1. **Client-facing deliverables** — anything a client reads or runs: a site launch, a report, a
   proposal, a handoff doc, code merged into a client repo.
2. **Security-sensitive diffs** — auth, authz/RLS, secrets, payments, input handling at a trust
   boundary, anything `security-hardening` applies to.
3. **Anything published publicly** — a public repo, a package, a blog post, a public plugin. This
   marketplace counts.

Everything else gets the standard single review. Don't spend the gate on internal drafts or on
checks a command can settle (type-check, tests, lint): run those in `verify`, then the gate.

## The rubric (write it before the reviewers start)
Every criterion has an objective pass/fail condition. Vague rubric, vague review. Start from:

| Criterion | Pass | Fail signal |
|---|---|---|
| Correct | Claims, numbers and code behavior check out against source or a run | Invented stat, wrong version, nonexistent API, logic bug |
| Complete | Every spec requirement / acceptance criterion addressed | Missing section, skipped edge case |
| Safe | No secrets, PII, client names in public output. Input surface (the work reads data it did not create: a request, form, file, webhook, CLI argument, URL): input validated. Access surface (anything not every caller may do: reading or changing data owned by or scoped to a user, account, organization, tenant, project or role, or any privileged or system-wide action such as admin settings): authorization checked. Each check is N/A only when its surface is absent, stated separately with the reason | Leaked key, a client named in a public repo, IDOR, an N/A whose surface is actually present |
| Consistent | No contradictions inside the work | Section A says X, section B says not-X |
| Fits the audience | No internal jargon or unexplained acronyms, no private paths or internal links, no TODO/FIXME, every next step names who does it | Internal jargon, unexplained acronyms, private paths, internal links, TODOs, next steps with no owner |

Add the deliverable's own rules (the spec's acceptance criteria, brand voice, the repo's
`AGENTS.md`). Same rubric for both reviewers.

## Procedure
1. **Two fresh reviewers in parallel.** Dispatch two subagents (two `cklph-reviewer`, or two
   `red-team` for security diffs). Each gets the spec, the work, and the rubric. Neither sees the
   other's review, the conversation, or your opinion of the work.
2. **Verdict.** Ship only if **both** pass. A flag from one reviewer is real: the other reviewer's
   miss is exactly the blind spot this gate exists for.
3. **Fix round.** Merge both lists, fix every failing criterion, change nothing else. Re-run
   **both** reviewers as **new** subagents (no memory of the last round; it anchors them).
4. **Cap: 2 fix rounds.** Still failing after round 2 → stop and escalate to Peter with the
   remaining failures, both reviewers' notes, and what you tried. Do not loop a third time, and do
   not ship on one pass out of two.

## Reviewer prompt
```text
You are an independent reviewer. You have not seen any other review of this work.
Your job is to find problems, not to approve.

Spec: <spec or acceptance criteria>
Work: <the diff, document or deliverable>
Rubric: <the table>

For each criterion: PASS, or FAIL with the exact problem and where it is. N/A only for a
sub-check the rubric allows it for, with the reason; an N/A you disagree with is a FAIL.
Then: Critical issues (must fix) and Suggestions (optional).
End with the agent's own marker, last and outside any code block: `## REVIEW CLEAN` (pass) or
`## ISSUES FOUND` (fail) for cklph-reviewer; `## RED-TEAM CLEAR` or `## RED-TEAM FINDINGS` for red-team.
```

## Limits
Two reviewers can miss the same thing. For the highest-stakes output, add Peter's own read; the
gate reduces his review load, it doesn't replace his judgment on what ships under his name.
