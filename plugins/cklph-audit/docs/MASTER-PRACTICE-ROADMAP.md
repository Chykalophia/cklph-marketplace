# cklph-audit — master-practice roadmap

*How elite auditors, staff+ reviewers, and frontier agentic tools actually work — and the concrete
upgrades that would move cklph-audit (and the cklph review stack) from "very good" toward that bar.*

Built 2026-07-18 from three research syntheses (elite security-audit firms · staff-level review
cognition · SOTA agentic-audit tooling) plus a grounding pass over the current stack
(`cklph-audit` v0.2.1, `cklph-os` `cklph-reviewer` + `red-team`). Sources are cited inline as `[†]`
with the full list at the bottom.

---

## 0. The honest baseline — what we already do at frontier level

Before the gaps, the wins, because they scope the work: **the frontier has converged on one
architecture — deterministic substrate for recall → LLM agent for judgment → adversarial
verification for precision → learned suppression → coverage accounting → calibration — and
cklph-audit already implements every layer.** The SOTA survey describes this as exactly where Big
Sleep/Project Naptime, Semgrep Assistant, and the *Refute-or-Promote* line independently landed
`[Naptime][RoP][Semgrep]`.

| Frontier practice | Our implementation | Status |
| --- | --- | --- |
| Recall from deterministic tools, not the LLM | `tools/*.sh` per lens, run before judgment | ✅ shipped |
| Adversarial refutation gate (default-refuted, fresh context) | `audit-verifier`, Huang et al. framing | ✅ shipped — this is the frontier's central precision bet `[RoP][Naptime]` |
| Learned, poison-resistant triage memory | `.audit-baseline.json` (git-tracked, human-accepted) | ✅ shipped — and the *safe* design: autonomous memory stores get poisoned, missing 66% of attacks `[A-MemGuard]`; ours is auditable |
| Calibration on ground truth, not raw counts | `/cklph-audit:backtest` + fixtures (recall≥0.8/precision≥0.7 gate) | ✅ shipped — the exact mitigation for LLM-judge miscalibration `[JudgeBias]` |
| Coverage accounting, no silent truncation | rule-closure matrix + coverage summary + positive controls (v0.2) | ✅ shipped |
| Risk-routed cost | quick-mode riskScore sampling + per-stage model routing (v0.2.1) | ✅ shipped |

The adjacent review stack is also already adversarial: `red-team` (assume-broken, burden-of-proof,
enumerate-then-disprove) and `cklph-reviewer` (three axes + a bias hunt). **We are not starting from
behind. The work below is refinement, not rebuild.**

---

## 1. One correction to what we shipped (do first) — ✅ shipped in 0.3.0

**Majority-refute voting is a weaker arbiter than we treated it as.** The research is blunt: majority
voting carries a *conservative-verdict bias*, a 3×3 vote can score **below** single-pass, and
consensus is not truth — in one study **80+ agents unanimously endorsed a non-existent
vulnerability** `[RoP]`. Our verifier already defaults-to-refuted and asks for counter-evidence,
which is the right posture, but the *promotion decision* currently rests on the vote count.

**Fix (verify-stage):** make the **arbiter the evidence, not the tally**. A finding promotes when a
verifier produces a concrete *reachability trace* (attacker-controlled input → sink, or the broken
invariant path) — and is killed when any verifier cites a specific guard (`file:line`). The vote
becomes a signal, not the decider. Use the panel for *recall* (union of what reviewers surface),
never let agreement alone promote. This is a small change to the reconcile logic + verifier prompt,
and it hardens the exact mechanism v0.2 leans on.

> **✅ Shipped in 0.3.0.** Promotion is now evidence-arbitrated: low/medium keep the majority
> rule, critical/high require a `reachabilityTrace`; verifier snippets are comment-stripped
> (T1.3). See `SPEC-v3.md` §A1.

---

## 2. The cross-cutting lesson: **model before you read**

The single biggest gap between our flow and an elite firm's is **phase ordering**. Trail of Bits
runs *design review → threat model → then* code review, deliberately, so every finding traces to a
root cause and knowledge compounds `[TRAIL][ToB]`. Staff reviewers do the same in miniature:
reconstruct intent and extract invariants *before* reading lines `[eng-practices][APoSD]`. Our engine
goes straight from unit discovery to unit×lens review. Recon enumerates the *surface* but never
builds a *model* of it.

Everything in Tier 2 below is a consequence of closing this one gap.

---

## 3. Roadmap — tiered by leverage ÷ effort

Honest tiering. Not all of this should be built; Tier 1 is the high-confidence set.

### Tier 1 — high leverage, fits the current engine, low risk (✅ shipped in 0.3.0)

**T1.1 — Variant analysis pass.** *✅ Shipped in 0.3.0 (new Variant phase + `tools/variant-sweep.sh`; siblings re-verify through the same gate).* *The highest-leverage recall multiplier in the entire research
corpus.* Project Zero's discipline: a bug is rarely alone — ~half of in-the-wild 0-days are variants
of *already-patched* bugs that everyone missed `[PZero-variant][PZero-more]`. On every **confirmed**
finding, abstract it to a pattern and sweep the whole repo for siblings; siblings become new
candidates that re-enter verify. We already compute `normalizedSnippet` for fingerprinting — reuse
it as the seed for an auto-generated grep/Semgrep query. Cheap, and it turns one finding into its
whole family. → new reconcile-phase step + a `variant-sweep` tool.

**T1.2 — Root-cause + violated-invariant in the finding schema.** *✅ Shipped in 0.3.0 (`rootCause` + `invariant` + `boundary` on `REVIEW_SCHEMA`; reviewer must reject symptom-only fixes).* The clearest master-vs-competent
signal: competent reports say "X is broken, fix X"; masters trace the symptom to the *root cause and
the invariant it violates*, then give tiered remediation `[IA360][PZero-more]`. Add `rootCause` and
`invariant` fields; the reviewer prompt must trace symptom → root before proposing a fix, and reject
a "fix" that only patches the symptom. Small schema + prompt change, large output-quality jump.

**T1.3 — Verifier debiasing.** *✅ Shipped in 0.3.0 (`stripComments()` before the verifier sees the snippet; paired with §1). Voter/candidate order isn't randomized — voters are independent parallel calls with no within-prompt position bias, noted in the engine.* LLMs anchor on comments and labels — "*words speak louder than
code*"; the identical snippet gets different verdicts by presentation `[Heuristics]`. Strip comments
from the snippet before it reaches the verifier, have it re-derive the finding from code alone, and
randomize voter/candidate order. Pairs with §1. Nearly free, directly lifts precision.

**T1.4 — Risk-routed review depth.** *✅ Shipped in 0.3.0 (`riskRouting` config scales verifier voters + effort by unit `riskScore`; logged per unit).* We already have `riskScore` per unit (for quick sampling) and
per-stage model routing (v0.2.1) — but review *depth* is uniform. Masters spend by blast radius:
auth/money/data-loss/migrations get deep scrutiny, a log tweak gets a glance `[RADAR][eng-practices]`.
Scale **verifier voters + model/effort by unit riskScore**: crown-jewel units get more voters and a
higher tier; low-risk units get fewer. Reuses machinery we already shipped; just wires riskScore into
the verify fan-out.

### Tier 2 — new mechanics, real design work (✅ shipped in 0.3.0)

**T2.1 — A "map" phase before review (the big one).** *✅ Shipped in 0.3.0 (new Map phase + `audit-modeler` agent + `MAP_SCHEMA`; reviewers get their unit's invariants + gating boundaries).* A lightweight model phase, produced *before*
line review, emitting: **trust boundaries** ("anywhere security controls gate a connection"), a
**data-flow sketch** (routes → sinks), and **per-unit invariants** `[TRAIL][STRIDE][DFD]`. Then every
security finding must cite the boundary it crosses, and taint findings reference the source→sink path.
This is phase-ordering like ToB — the highest *conceptual* upgrade and the most work. Fits as a new
`audit-modeler` agent between Discover and Review, feeding the reviewers a threat model instead of
raw globs.

**T2.2 — Coverage narrative (positive assurance).** *✅ Shipped in 0.3.0 (reconcile collects near-misses; synthesizer writes the per-area narrative from near-misses + crown jewels + coverage totals).* Our matrix + positive controls point at this but
stop short. The Cure53 model: for each scope area, *narrate what was probed, why it held, and which
near-misses were chased to ground* — e.g. "no XSS, due to strict Vue escaping"; "a raw-SQL site in
`GiftCardBatchStats`, but variables proved non-user-controllable after investigation" `[Cure53]`. The
distinction is **positive vs. negative assurance**: not "we found nothing" but "we gathered enough
evidence that contrary evidence would have surfaced" `[Assurance]`. A clean area with no narrative is
treated as *un-reviewed*. → synthesizer + report-format extension; turns our coverage matrix into a
genuinely trustworthy clean-bill.

**T2.3 — Omission / negative-space lens.** *✅ Shipped in 0.3.0 (opt-in `omission` lens + `tools/omissions.sh`; rule ids `omission:<kind>`).* The thing linters and LLMs miss most: the code that
*isn't there* — absent validation, missing error path, no rollback, unlogged failure, unhandled enum
case `[SoftwareSeni][eng-practices]`. `cklph-reviewer` already has an "omissions" axis; port it into
cklph-audit as a lens that, per external input / IO / branch, asserts {validation? error-path?
logging? rollback? test?} and reports the missing ones. Scored separately from defect-finding.

### Tier 3 — bigger bets, prove value first (the live backlog — deferred from 0.3.0)

- **T3.1 Git-history hotspots / change-coupling** as a `riskScore` input: churn × complexity, and
  temporal coupling ("you changed A but its historical co-change partner B is untouched") — signal a
  snapshot analysis structurally cannot see `[CodeScene]`.
- **T3.2 Graph/CPG reachability tool** (Joern/CodeQL-style) the reviewer queries for callers/reachability
  instead of blind file reads — the fix for context-window blindness on cross-file bugs
  `[CPG][Greptile]`.
- **T3.3 Specialized "weird-machine" lenses**: a concurrency lens (every check→use gap, TOCTOU — now
  web-exploitable via single-packet attacks `[PortSwigger]`), a state-machine lens (reachable-but-
  unintended transitions), an economic lens on value-bearing flows `[PZero-more]`.
- **T3.4 Ensemble panels** for crown-jewel units: diverse models/prompts beat depth for recall
  (+18% recall in the studies) `[Ensemble]` — expensive, so gate it to the highest-risk units only.
- **T3.5 Reproduction requirement** for the highest severities: Naptime/Big Sleep promote a finding
  only when it's *verified with a PoC* `[Naptime]`. We're read-only, so the analogue is a
  proven reachability trace (already in §1) — a full executable-repro lens is a later, opt-in bet for
  units with a test harness.

---

## 4. Parallel wins for the *review* stack (`cklph-reviewer` / `red-team`) — ✅ shipped in 0.3.0

Smaller, independent of the audit engine (all four shipped in the 0.3.0 wave — `cklph-os` version
bump tracked separately):

- **Conventional-Comments labeling** — every finding carries `{severity, blocking?, confidence}`;
  a blocking-decision table (block only on correctness/contract/security/data-loss/irreversible,
  everything else non-blocking or a question) + a **nit budget** so style noise can't outnumber
  correctness findings `[ConvComments][eng-practices]`. High-signal output discipline.
- **Pre-mortem pass** for high-stakes reviews — "it's six months later and this shipped an incident;
  what was it?" Prospective hindsight yields ~30% more, more-specific risks `[Klein]`; back-derive the
  code path. A natural `red-team` escalation.
- **Intent reconstruction first** — the reviewer's first output is "here's what I think this change is
  *for*"; if intent is absent, surface that before findings `[eng-practices]`. `cklph-reviewer` reads
  tests-first already; make intent explicit.
- **Formalize the inversion pass** — `red-team` already enumerates-then-disproves; add the dual
  prove-correct / prove-broken framing so only findings surviving the "prove broken" pass ship high-
  confidence `[devansh]`.

---

## 5. Suggested sequencing

> **Outcome (0.3.0):** steps 1–5 all shipped in the one 0.3.0 "master-practice" wave (T2.1/T2.2/T2.3
> came forward from the tentative v0.4 into 0.3.0), plus the §4 review-stack wins. Only step 6's
> Tier 3 bets remain. The original plan is kept below for provenance.

1. **§1 correction + T1.3 debiasing** — same file (verify stage), hardens what we shipped. One small PR.
2. **T1.1 variant analysis + T1.2 root-cause schema** — the two biggest quality multipliers; a v0.3 `/cklph-os:flow`.
3. **T1.4 risk-routed depth** — wires existing pieces together; folds into the v0.3 build.
4. **T2.1 map phase** — the flagship v0.4; spec it separately, it's the largest design. *[Actually shipped in 0.3.0.]*
5. **T2.2 coverage narrative + T2.3 omission lens** — round out v0.4's "trustworthy clean bill." *[Actually shipped in 0.3.0 — the `omission` lens is the opt-in `omission:<kind>` lens + `tools/omissions.sh`.]*
6. Tier 3 + review-stack wins — opportunistic, value-proven first.

Everything in Tier 1 reuses machinery already in the engine (normalizedSnippet, riskScore, model
routing, the verify fan-out). That's the boring-wins path: **the frontier architecture is built;
these are the master-practitioner refinements that make its output trustworthy and its recall
compound.**

---

## Sources

Elite audit practice: [TRAIL] ToB threat-modeling · [ToB] ToB software assurance · [PZero-variant] Project Zero, Naptime→Big Sleep · [PZero-more] PZero "The More You Know" · [Cure53] Cure53 IVPN 2024 report (Test Methodology = the positive-assurance template) · [Assurance] positive vs negative assurance · [IA360] root-cause audit quality · [STRIDE]/[DFD] threat-modeling frameworks · [PortSwigger] web race conditions · [devansh] "Needle in the Haystack" (attacker-framing) · [CVSS] CVSS limits.
Review cognition: [eng-practices] Google code-review standard · [APoSD] Ousterhout, deep modules · [ConvComments] Conventional Comments · [Klein] pre-mortem / prospective hindsight · [RADAR] Meta risk-calibrated review · [CodeScene] change-coupling/hotspots · [SoftwareSeni] AI-review intent ceiling.
Agentic tooling: [Naptime] Project Naptime · [RoP] Refute-or-Promote · [Semgrep] Semgrep Assistant memories · [Ensemble] ensembling LLMs for vuln detection · [Heuristics] "words speak louder than code" · [JudgeBias] LLM-as-judge bias · [A-MemGuard] memory-poisoning · [CPG] Joern+LLM · [Greptile] cross-file graph review · [SWR-Bench] naive-LLM-review ceiling.

*(Full URLs preserved in the session research transcripts.)*
