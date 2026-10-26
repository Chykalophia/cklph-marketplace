# cklph-audit

**Comprehensive, adversarially-verified, agentic whole-repo security suite — that also proves what it covered.**
Marketplace: `cklph` · install: `claude plugin install cklph-audit@cklph` · CLI-only (sub-agents + workflows).

> Diff-review tools (CodeRabbit, `/code-review ultra`, the cklph-reviewer agent) deliberately stay on the **diff**. `cklph-audit` fills the other gap: **deep reasoning over the _whole_ repo** — decompose the codebase, fan out a sub-agent per subsystem × lens, **refute** each finding to kill false positives, drop anything already accepted in a baseline, and synthesize a triaged report + a remediation-wave plan that feeds `/cklph-os:flow`. v2 adds the completeness accounting: recon denominators, a rule-closure coverage matrix, and positive controls — the report shows what was checked and clean, not just what's broken. v3 adds the master-practitioner mechanics: a threat-model **Map** phase before review, an evidence-arbitrated verifier (critical/high must supply a reachability trace), Project-Zero **variant analysis** on confirmed bugs, root-cause + violated-invariant per finding, risk-routed depth, and a positive-assurance **coverage narrative**. **v1.0 (the comprehensive security suite)** adds nine new lenses (SCA, IaC, container, K8s, supply-chain, compliance, concurrency, state-machine, economic), deterministic-tool recall (Semgrep, Trivy, Grype, Syft, Checkov, Kubescape, gitleaks), opt-in **DAST** + exploit-to-confirm in sandbox (CodeMender core), opt-in **patch generation + validation** (test + re-exploit + LLM-judge), adversarial **self-review** of the report, **SOC 2 + CASA compliance matrix**, and vulnerability feed freshness checks.

It's the productized version of a hand-run **8-agent pre-certification security audit**; v2 ports the coverage accounting from the ZenCoder audit methodology.

---

## When to use it (and when NOT)

**Use it for:** a periodic deep pass — pre-compliance (CASA/SOC2), pre-launch, post-big-refactor, "we haven't looked at the whole thing in a while," onboarding a new repo, or hunting a class of bug across the codebase (all the silent failures, all the N+1s).

**Do NOT use it for:** per-PR review. That's what diff review is for, and it stays your default. A whole-repo audit is expensive and surfaces a lot — it's a scheduled-quarterly / before-a-milestone move, not a per-change one.

---

## Design principles (boring-wins)

1. **Scope is mandatory.** You pick lenses. "Audit everything" → noise. There is no unscoped mode.
2. **Adversarial verify is non-negotiable.** Every finding is attacked by a separate refuter before it reaches you. False positives are the #1 way AI audits lose trust; this is the feature that earns it.
3. **Delta over re-noise.** A git-able baseline of accepted/known findings means re-runs show only what's **new**. Your "deferred to H-8" decisions never resurface.
4. **Transparent + git-able.** Config, baseline, and reports are plain files in the repo. No hidden state. Nothing gets silently truncated — what was skipped (sampling, or a hit runtime ceiling) is logged, and every rulebook rule no reviewer touched renders as `NOT CHECKED` in the coverage matrix.
5. **Cost-bounded.** Top-risk sampling mode and loop caps are first-class; a config `budget` is **advisory** today — the engine doesn't yet read `budget.total` (the Workflow runtime enforces its own token ceiling).

---

## Quick start

```bash
claude plugin install cklph-audit@cklph
# in the target repo, once:
/cklph-audit:init                 # scaffolds audit.config.yaml (auto-detects subsystems)
# then:
/cklph-audit:run security,correctness,architecture
# triage the report, then accept what you're deferring:
/cklph-audit:baseline             # everything currently open becomes the accepted baseline
# next quarter:
/cklph-audit:run security         # shows only NEW security findings since the baseline
```

Cheap scoping pass (top-risk subsystems only, no full fan-out):

```bash
/cklph-audit:quick security
```

`:quick` also skips the recon phase to stay cheap — no denominators or seeds, and the report appendix says so. Set `recon: { quick: true }` in config if you want recon in quick mode anyway.

---

## The lenses

Project-agnostic knowledge packs. Each layers **over** the repo's own rules (e.g. a project's `CLAUDE.md`/`AGENTS.md`), so it speaks your conventions, not generic ones — and since v2, each answers for **every** repo rule handed to it (see the coverage matrix below).

| Lens | Hunts for |
| --- | --- |
| **security** | CWE/ASVS/OWASP: authz/authn gaps, injection (Semgrep recall), secrets (gitleaks), SSRF, RLS/row-scoping, money & privilege paths, unsafe deserialization, path traversal, missing rate-limit/CSRF. (The CASA lens.) |
| **correctness** | Silent failures, swallowed errors, missing error IDs, state-machine catch-block gaps, race conditions/TOCTOU, null/undefined handling, off-by-one, fail-open defaults. |
| **architecture** | DRY/duplication (extract-when-3+), layering violations, dead code, god-objects, circular deps, contradictory sources of truth, files over the size limit. |
| **sca** (v1.0) | Software composition analysis: dependency CVEs (Trivy/Grype/Syft/OSV-Scanner), transitive depth, abandoned/malicious packages, license risk. Judge by reachability — is the vulnerable function actually called? |
| **iac** (v1.0) | Infrastructure-as-code misconfig (Checkov/KICS/tfsec): public S3 buckets, open security groups, IAM over-permission, unencrypted storage, missing logging. Terraform/CFN/Pulumi/Dockerfiles. |
| **container** (v1.0) | OCI image scanning (Trivy/Grype/dive/hadolint): vulnerable base images, secrets in layers, root/privileged, missing healthcheck, unpinned digests. |
| **k8s** (v1.0) | Kubernetes manifest scanning (Kubescape/kube-bench/kube-hunter): RBAC over-permission, privileged pods, hostPath mounts, missing network policies, pod security standards. |
| **supply-chain** (v1.0) | CI/CD pipeline security (semgrep CI): `pull_request_target` with secrets, unsigned artifacts, SLSA gaps, dependency confusion, typosquatting. `.github/workflows/`, GitLab CI, Jenkinsfile. |
| **compliance** (v1.0) | Compliance cross-mapping: maps findings from all other lenses to SOC 2 Trust Services Criteria + CASA controls, plus an opt-in HIPAA technical-safeguard rulebook (1.2.0, `compliance.frameworks: [hipaa]`). Produces a compliance matrix — every control → met/violation/not-applicable/not-checked. |
| **concurrency** (v1.0, T3.3) | Every check→use gap, TOCTOU, web race conditions (single-packet attacks), atomicity violations, deadlock potential. Pure reasoning — anchor to file:line. |
| **state-machine** (v1.0, T3.3) | Reachable-but-unintended state transitions, missing terminal states, non-idempotent transitions. Pure reasoning. |
| **economic** (v1.0, T3.3) | Value-bearing flow analysis: money/entitlement/privilege paths where the economic incentive is the attack vector. Pure reasoning. |
| **docs-drift** (opt-in) | The rulebook itself: paths, script names, and scoped package names (`@scope/pkg`) in your `rulesFrom` docs that no longer match the tree — unscoped tech-name prose ("BullMQ" in the docs, QStash in the code) is the judgment layer's catch. LOW severity by default; MEDIUM+ only when the drift misleads a security control. |
| **agent-config** (opt-in, 1.2.0) | The AI tooling layer, statically: MCP configs (`@latest`/dist-tag/bare/range package selectors, untagged-digest Docker images, remote URLs, literal secrets, shell-wrapped servers), `.claude` settings (`bypassPermissions`, `Bash(*)`, no deny list), hooks (curl-to-bash, absolute paths, tool-input injection, fail-open gates), `CLAUDE.md`/`AGENTS.md`/skills (prompt-injection-shaped or auto-run instructions, secrets), and agent runtimes that turn untrusted content into tool actions. Never executes a discovered server or hook. Rule ids `agentcfg:<kind>`. |
| **omission** (opt-in, v3) | Negative space — the code that _isn't_ there. Per external input / IO / branch it asserts `{ validation? error-path? logging? rollback? test? }` and reports the MISSING ones. Rule ids `omission:<kind>`; severity by real impact. The class of bug linters and pure-LLM passes miss most. |

`docs-drift`, `agent-config`, and `compliance` are exceptions to the unit × lens cross-product: `docs-drift` runs as exactly **one** job over the `rulesFrom` docs; `agent-config` runs as exactly **one** job over the AI-tooling globs (override with `agentConfig.globs`); `compliance` runs as a single post-reconcile mapping job that takes the aggregated confirmed findings from all other lenses and maps them to SOC 2 / CASA (and, when selected, HIPAA) controls. None fans out per unit. All three are opt-in — ask for them explicitly (as is `omission`).

Extensible (later): `performance` (N+1, hot paths, caching, bundle), `a11y` (WCAG/dark-mode).

**How a lens stays honest:** a lens isn't just a prompt — it's a deterministic **tool** for recall (`jscpd` for DRY, ESLint for floating awaits, `gitleaks` for secrets, `dependency-cruiser` for layering) + the **LLM** for judgment + the **verifier** for precision. Pure-LLM detection of DRY/SOLID over-flags coincidental similarity and misses cross-file clones, so the tool does the enumerating and the model does the judging. Every lens is then validated against **golden fixtures** (planted issues it must catch / clean look-alikes it must not flag) and a **git backtest** before it's trusted — see `SPEC.md` §4 & §10.

---

## How it works (11 phases)

```
 1. DISCOVER    audit-scout INFERS units (subsystem → globs) + surface; escalates to
               audit-unit-mapper when the repo won't decompose cleanly, flags low-confidence
               units. In parallel, a rulebook extractor parses the rulesFrom docs
               (CLAUDE.md/AGENTS.md) into discrete, citable rules.
 2. RECON       one audit-recon per lens (concurrent with Discover): denominators
               (re-runnable enumeration command + candidate count), cited seeds (hints,
               not findings — reviewers re-verify every one), and safe-control candidates.
               Skipped in :quick — and logged, never silent.
 3. MAP         one audit-modeler builds a lightweight threat model (v3): trust boundaries,
               data-flows (source → sink), per-unit invariants, and crown jewels. Feeds the
               reviewer its unit's invariants + the boundaries gating it. Skips in :quick.
 4. REVIEW      audit-reviewer × (unit × lens) → findings + a ruleCheck for EVERY rule
               handed + honest coverage counts. Traces symptom → rootCause + names the
               violated invariant, cites the boundary crossed.   [pipeline, parallel]
 5. VERIFY      audit-verifier refutes each finding from COMMENT-STRIPPED code; evidence, not
               vote tally, arbits (v3): low/medium promote on majority, critical/high require
               a reachabilityTrace. Depth risk-routed per unit.   [adversarial]
 6. DAST        opt-in (dast.enabled): audit-dast-runner boots the app, runs ZAP/Nuclei/ffuf,
               collects runtime findings → re-enter verify. Then audit-exploit-verifier
               generates PoC exploits for confirmed critical/high, runs them in an isolated
               sandbox (CodeMender core). Skips by default (read-only); off in :quick.
    RECONCILE  plain code (not an agent): dedup + baseline + rule closure + coverage totals
               + near-misses + positive-control harvest.
 7. VARIANT     for each confirmed critical/high, an audit-reviewer hunts SIBLINGS repo-wide
               (v3, Project Zero variant analysis) via variant-sweep.sh; candidates re-verify
               through the SAME gate. Skips in :quick.
    COMPLIANCE  single post-reconcile job (when compliance lens is in scope): maps all
               confirmed findings to SOC 2 + CASA controls → compliance matrix.
 8. PATCH       opt-in (patch.enabled, auto-on with DAST): audit-patcher generates patches
               addressing root cause, applies in sandbox worktree, runs tests, re-runs exploit
               (must fail), LLM-as-judge. Skips by default; off in :quick.
 9. SYNTHESIZE  audit-synthesizer → AUDIT-<date>.md (coverage summary + matrix + compliance
               matrix + a positive-assurance coverage narrative, severity buckets with
               DAST/exploit/patch evidence, positive controls (INFO), remediation-wave plan
               that feeds /cklph-os:flow)
10. SELFREVIEW  adversarial self-review of the report (the "check itself" loop): an
               audit-reviewer re-reads the report for gaps, missed areas, under-explored
               crown jewels. Gaps are surfaced in the appendix. Default true in full; off
               in :quick.
```

Implemented as one deterministic **Workflow** so the fan-out and verify are reproducible. `:quick` skips the Map + Variant + DAST + Patch + SelfReview phases (and recon) to stay cheap. See `SPEC.md` (v1 engine), `SPEC-v2.md` (the coverage delta), and `SPEC-v3.md` (the master-practice upgrade).

---

## What v2 adds (coverage you can check)

v1 is a repeatable engine. v2 is the same engine that can also show what it covered — six mechanics:

1. **Recon with denominators + seeds** — before any review, each lens's concern surface is mechanically enumerated. Denominators are the report's coverage math (`.single()` callsites → 325), recorded with the exact command so you can re-run it. Seeds are pre-qualified leads — hints, not findings; reviewers must re-open every one, because citations drift.
2. **Rule-closure coverage matrix** — the repo's own rules become a discrete rulebook, and every rule gets a matrix row: finding IDs, a cited `verified-safe`, a `not-applicable` reason, or an honest `NOT CHECKED`. No rule is silently absent.
3. **Coverage summary** — `examined X / N` per denominator. Where X < N the report says "sampled" and why (risk-weighting). Arithmetic, not vibes.
4. **Positive controls (INFO)** — refutations that cite a concrete guard, verified-safe rule checks, and confirmed recon safe-patterns ship as a "checked and clean" section. Noise-gated (must attach to a rulebook rule or have killed a critical/high candidate) and capped (`positiveControls.max`, default 15; 0 disables). This knowledge used to evaporate every run.
5. **Docs-drift lens** — audits the rulebook against reality (see the lens table above). One job over the `rulesFrom` docs, opt-in.
6. **Richer findings** — every finding carries `confidence` (confirmed / likely / needs-owner-input), `validationSteps` (the read-only checks that confirmed it), a `remediationBucket` (quick-win / targeted-fix / systemic-refactor / owner-decision), and `context` (server/client · prod/test/generated · gated) — classified **before** severity, so severity reflects real exploitability, not a raw pattern match. `owner-decision` items render as questions for the owner, not scheduled work.

Plus **per-stage model routing**: `config.models.<stage>` sends mechanical stages (scout, recon, rulebook) to cheap model/effort tiers and routes the verifier — the precision bet — up, while judgment stages inherit the session model. The difficulty heuristic is encoded in config, where you can see and tune it; omit the block and everything inherits (v1 behavior).

**Bounded fan-out**: the verify phase (the findings-unbounded term) is capped at `verify.maxVerifierAgents` (default 400) across the whole run, so a findings-heavy repo can't blow the runtime's 1000-agent ceiling. Critical/high are verified first; overflow candidates are **deferred — unverified and surfaced** in the report (never silently dropped), with a re-run recommendation.

Backward compatible: a v1 `audit.config.yaml` runs unchanged — recon defaults on, positive controls default to 15, docs-drift only when you ask for it, model routing inherits everywhere, and the fan-out cap only changes behavior on repos large enough to have hit the runtime ceiling anyway.

---

## What v3 adds (master-practice refinements)

v3 keeps the whole v1/v2 engine and adds the way elite auditors and staff-level reviewers actually work — model before you read, trace to root cause, hunt siblings, spend by blast radius, and hand back a trustworthy clean bill. Seven mechanics:

1. **Map phase — model before you read.** Between recon and review, one `audit-modeler` builds a lightweight threat model: **trust boundaries** (where a control gates a connection), a **data-flow sketch** (source → sink), **per-unit invariants** (properties that must hold), and the **crown jewels**. Reviewers then get their unit's invariants (a violation is a finding) and the boundaries gating it — security findings cite the `boundary` crossed. This is the phase-ordering elite firms use (design → threat model → then code). Skips in `:quick`; a dead modeler degrades to an empty model, flagged in the appendix.
2. **Evidence-arbitrated verify.** Majority-refute voting is a conservative-biased arbiter and consensus isn't truth (in one study 80+ agents endorsed a non-existent vuln). So the verifier now re-derives each finding from **comment-stripped** code (LLMs anchor on reassuring comments), and the arbiter is the **evidence**: low/medium still promote on majority, but a **critical/high must supply a `reachabilityTrace`** (attacker-input → sink, or the invariant-violation path) — "plausible" without a trace is refuted. To kill a finding a voter cites the guard `file:line`. The vote becomes recall signal, not the decider.
3. **Root cause + violated invariant per finding.** The clearest master-vs-competent signal. Every finding carries `rootCause` (the underlying fault, not the symptom), `invariant` (the property it violates), and `boundary` (when the Map ran) — and the reviewer must reject a fix that only patches the symptom.
4. **Variant analysis.** A bug is rarely alone — ~half of in-the-wild 0-days are variants of already-patched bugs everyone missed. Each confirmed critical/high seeds a repo-wide **sibling hunt** (`variant-sweep.sh` for recall, then judgment); siblings re-enter the SAME verify gate. Capped (`variant.maxSeeds` × `variant.maxPerSeed`). One finding becomes its family.
5. **Risk-routed review depth.** Verifier voters (and effort) scale with the unit's `riskScore`: crown-jewel units get more voters and a higher tier; a log tweak gets fewer (floored at 1). Spend by blast radius. Tunable in `riskRouting`; logged per unit.
6. **Coverage narrative (positive assurance).** The report now narrates, per area, what was probed, why clean areas held, and which **near-misses** were chased to ground ("a raw-SQL site, but the variables proved non-user-controllable after investigation"). A clean area with no narrative is treated as un-reviewed — positive assurance, not "we found nothing."
7. **Omission lens (opt-in).** Negative-space judgment — the missing validation / error path / rollback / log / test — ported from the review stack (see the lens table).

Config-compatible: a v1/v2 `audit.config.yaml` runs with **no config changes required**, every new key defaulting on-but-safe. **One real behavior change to note:** with `riskRouting.enabled` defaulting true, voter counts now scale with unit risk — high-risk units get *more* voters, low-risk ones *fewer* — so a v1/v2 config votes differently than it used to; set `riskRouting.enabled: false` to restore uniform voting. The Map + Variant phases skip in `:quick`, and the `omission` lens is opt-in. **Tier 3 of the roadmap (git-history hotspots, a CPG reachability tool, weird-machine lenses) is explicitly deferred** — see `docs/MASTER-PRACTICE-ROADMAP.md`.

---

## What v1.0 adds (the comprehensive security suite)

v1.0 takes the v3 engine and extends it from a "very good audit tool" to a **full enterprise-class security suite** — covering every layer from source code to cloud infrastructure, with dynamic verification, automated patching, compliance mapping, and self-review. Nine additions:

1. **Nine new lenses.** SCA (dependency CVEs via Trivy/Grype/Syft/OSV-Scanner), IaC (Terraform/CFN/Dockerfile misconfig via Checkov/KICS/tfsec), container (OCI image scanning via Trivy/Grype/dive/hadolint), K8s (RBAC/pod-security via Kubescape/kube-bench/kube-hunter), supply-chain (CI/CD pipeline security via semgrep CI), compliance (SOC 2 + CASA cross-mapping), plus three Tier-3 "weird-machine" lenses (concurrency, state-machine, economic). Each security lens ships with a deterministic tool for recall and golden fixtures for precision/recall validation.

2. **SAST recall for the security lens.** `sast.sh` wraps Semgrep (security-audit + owasp-top-ten rulesets) + optionally CodeQL. The security lens now runs it FIRST for exhaustive injection/SSRF/XSS/deserialization/path-traversal recall, then judges candidates. Plus `cpg.sh` for cross-file reachability queries (Joern or grep-fallback).

3. **DAST + exploit-to-confirm (opt-in, sandboxed — the CodeMender core).** `audit-dast-runner` boots the app (Docker Compose / local dev), runs ZAP/Nuclei/ffuf, and collects runtime findings (auth bypass, session, IDOR, headers, rate limits). `audit-exploit-verifier` generates PoC exploit scripts for confirmed critical/high findings with reachability traces and runs them in an isolated Docker sandbox. A finding is only `confirmed-exploitable` if the PoC succeeds — "plausible" stays `likely`.

4. **Patch generation + validation (opt-in, auto-on with DAST).** `audit-patcher` generates a code patch addressing the root cause, applies it in a sandbox git worktree, runs the test suite, re-runs the exploit (must FAIL — vuln closed), and runs an LLM-as-judge pass for functional correctness. Up to 3 iteration rounds. Patches are proposals for developer review, not auto-merges.

5. **Adversarial self-review (the "check itself" loop).** After synthesis, an audit-reviewer re-reads the report for gaps — missed areas, under-explored crown jewels, coverage narrative honesty. Gaps are surfaced in the appendix. Default true in full mode; up to `selfReview.maxRounds` rounds.

6. **SOC 2 + CASA compliance matrix (NOT HIPAA).** The compliance lens runs as a single post-reconcile mapping job, taking the aggregated confirmed findings from all other lenses and mapping them to SOC 2 Trust Services Criteria + CASA controls. Every control → `met` (cite the guard) / `violation` (link finding) / `not-applicable` (reason) / `not-checked` (gap requiring manual evidence). This is the audit's bridge to a formal attestation.

7. **Feed freshness checks.** `feed-status.sh` checks CVE database age and tool versions. `/cklph-audit:refresh-feeds` updates vulnerability feeds and checks for new tools/CVE sources. The report appendix warns if feeds are stale.

8. **Extended threat modeling.** The Map phase now includes cloud/infra trust boundaries (VPCs, security groups, IAM roles, public endpoints, container ingress, K8s policies, CI/CD trust) when IaC/container/k8s/supply-chain lenses are in scope.

9. **Git-history hotspots (T3.1) + CPG reachability (T3.2).** `git-hotspots.sh` (churn × complexity + temporal coupling) and `cpg.sh` (Joern or grep-fallback for callers/sinks) — the Tier-3 roadmap items, now shipped.

Config-compatible: a v3 `audit.config.yaml` runs unchanged — every new key defaults off-but-safe. DAST and Patch are **opt-in** (`dast.enabled: false`, `patch.enabled: false` by default — the audit stays read-only unless you explicitly break the seal). SelfReview defaults true in full mode. The compliance lens is opt-in (add `compliance` to the lenses list). The new security lenses (sca, iac, container, k8s, supply-chain) are available but not in the default lens list — add them explicitly. **No HIPAA** in 1.0 (added in 1.2.0 as an opt-in rulebook).

**MCP vulnerability intelligence (v1.1):** The SCA lens now auto-detects and uses `cve-mcp` and `vuln-intel-ext` MCP servers when available, enriching dependency vulnerability findings with EPSS scores, CISA KEV status, exploit availability, delta scanning ("what's new since last audit"), and WordPress vuln lookups. Config: `vulnIntel: { enabled: auto }` (default — uses MCP tools if present, falls back to local tools if not). Install the companion plugins: `claude plugin install vuln-intel-ext@cklph` and `npx cve-mcp`.

---

## What you get out

- **`AUDIT-<date>.md`** — a coverage summary (examined X/N per denominator, commands verbatim), the rule-closure coverage matrix, an optional compliance matrix (one sub-section per selected framework: SOC 2, CASA, HIPAA), findings bucketed Critical/High/Medium/Low (each with `file:line`, confidence, remediation bucket, why it's real and how the verifier confirmed it, a concrete fix, and — when DAST/patch ran — exploit PoC evidence and patch diffs), a positive-controls (INFO) section of checked-and-clean patterns, and a self-review appendix documenting the "check itself" loop.
- **A remediation-wave plan** — grouped, ordered fixes (quick wins first within a severity band) ready to hand to `/cklph-os:flow` or `cklph-implementer` waves; `owner-decision` items in their own subsection — they're questions, not work.
- **An updated baseline** (when you run `:baseline`) so the next run is delta-only.

---

## Cost & honest caveats

- A full multi-lens run on a large repo is a **real token spend** (it's many deep sub-agent reads). Use `:quick` to scope first and lean on the baseline so re-runs are cheap. (`config.budget.total` is advisory today — not yet read by the engine; the Workflow runtime's own token ceiling is the real bound.)
- **Without verify + baseline it floods you** — both ship in v1 for exactly this reason.
- It finds a lot of **pre-existing tech debt**. That's the point of the first run; the baseline is how you stop drowning in it afterward.
- Don't wire the scheduled/gate layer (roadmap, below) until a couple of manual runs prove the signal on a real repo (validation target: reproduce the CASA audit's top findings).

---

## Roadmap

- **v1 (0.1.0)**: `cklph-audit` plugin · security + correctness + architecture lenses · scout/reviewer/verifier/synthesizer agents · the workflow engine · `audit.config.yaml` + `.audit-baseline.json` · `run` / `quick` / `baseline` / `init` commands.
- **v2 (0.2.0)**: the coverage upgrade — recon (denominators + seeds), rulebook + rule-closure matrix, coverage math, positive controls (INFO), docs-drift lens, richer finding schema. See `SPEC-v2.md`.
- **v3 (0.3.0, current)**: the master-practice upgrade — Map phase (threat model) + `audit-modeler`, evidence-arbitrated verify (reachability trace), variant analysis + `variant-sweep.sh`, root-cause/invariant findings, risk-routed depth, coverage narrative, and the opt-in omission lens. See `SPEC-v3.md`.
- **Deferred (Tier 3, prove value first)**: git-history hotspots / change-coupling as a `riskScore` input · a CPG/graph reachability tool the reviewer queries · specialized weird-machine lenses (concurrency, state-machine, economic) · ensemble panels for crown-jewel units · an executable-repro requirement for the highest severities. Tracked in `docs/MASTER-PRACTICE-ROADMAP.md`.
- **v4 (1.0.0)**: the comprehensive security suite — 9 new lenses (sca, iac, container, k8s, supply-chain, compliance, concurrency, state-machine, economic), SAST recall, DAST + exploit-to-confirm, patch generation, adversarial self-review, SOC 2 + CASA compliance matrix, feed freshness checks. All Tier 3 items shipped.
- **v4.1 (1.1.0)**: MCP vulnerability intelligence integration — SCA lens auto-detects and uses `cve-mcp` (EPSS/KEV/exploit-availability/risk-ranking) and `vuln-intel-ext` (diff_since/delta-scanning/WordPress) MCP servers when available. Feed-refresh skill enhanced with MCP feed_status + delta scan.
- **v4.2 (1.2.0)**: the opt-in `agent-config` lens (static review of MCP configs, agent settings, hooks, instruction docs, skills, and agent runtimes) and an opt-in HIPAA rulebook for the compliance lens. Adapted from ECC (MIT); see each folder's NOTICE.
- **Later**: `performance` + `a11y` lenses · a scheduled weekly **delta** audit (emails/ClickUps only NEW findings) · a CLI pre-promotion gate (fast security lens before dev→staging→main) · auto-handoff of confirmed Criticals into a `/cklph-os:flow` remediation run.

See `SPEC.md` (the v1 engine), `SPEC-v2.md` (the coverage delta), and `SPEC-v3.md` (the master-practice upgrade) for the full build design.
