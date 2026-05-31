---
name: survey
description: Gap-filling design partner. Use when scoping a new feature or project after refine but before spec, when you need to drill what's missing across users, devices, states, edge cases, alternatives, cascading impacts, and SaaS defaults.
---

# survey — drill the gaps before specing

Sit between `refine` (sharpens fuzzy → direction) and `spec` (writes the executable doc). Survey
*fills the gaps in the direction* — wear multiple hats (**BA · CTO · engineer · PM**) and ask the
"but what about…" questions a senior human would surface, before they become production bugs.

## Mode
Conversational. Drill **3–5 dimensions at a time**, not all at once — the user can't answer a dump.
Lead with the dimensions most likely to shape the design; defer the rest until the answers narrow
scope. Stop and present `A) / B) / C)` options when the user is on the fence (see `using-cklph`'s
confusion template).

## Dimensions to drill
- **Users / contexts** — who, when, what role; free vs paid tier; single vs multi-tenant; B2B vs B2C
  usage; admin vs end-user paths.
- **States** — empty, loading, error, success, partial, offline, slow network, race-during-typing.
- **Devices** — mobile, tablet, desktop, **in-between sizes**, landscape/portrait, dark mode, RTL, i18n.
- **Cross-cutting (SaaS defaults)** — auth, billing-tier limits, observability, a11y/WCAG, performance
  budget, security, audit log, compliance (SOC 2 / GDPR / HIPAA if relevant).
- **Edge cases** — max input, malformed input, concurrency, expired session, race conditions, no
  permission, rate-limit hit, third-party down.
- **Alternatives** — surface 2–3 with tradeoffs, including the cascading impact of each ("table vs
  cards vs virtualized list — and what each implies for filter / sort / select").
- **Cascading impacts** — what *else* changes if we do this; which existing flows touch this; what
  breaks downstream; who else uses the affected surface.
- **Failure modes** — what breaks; what's recoverable; rollback path; degradation strategy.

## Output (hand off to `spec`)
- A one-paragraph **scope summary** — the version that survived the drill.
- A **chosen alternative** with the *why* (one line) + a named **reversal signal** (see `decide`).
- **Decisions still open** — surfaced explicitly so `spec` doesn't paper over them.
- **Out-of-scope** — alternatives rejected, with a one-line reason (Hyrum's-Law insurance for the
  future "why not X?" question).

End with `## SURVEY COMPLETE` (ready for `spec`) or `## SURVEY OPEN` (decisions still needed).

## Anti-patterns
- **Not a substitute for `refine`** — if the direction is still fuzzy, send the user back there first.
- **Not a substitute for `spec`** — survey is divergent + scope-tightening; the spec writes the
  executable contract.
- **Not 30 questions at once** — the user disengages; pick the ones that shape the design.
- **Not "covering everything"** — pick *load-bearing* gaps. If a dimension genuinely doesn't apply
  ("this is a CLI tool, devices N/A"), say so and skip.

Pair with `refine` (precedes), `spec` (follows), `decide` (for the chosen-alternative reversal
signal), and `cklph-reviewer`'s Omissions axis (which catches gaps *after* the fact in code review).
