# Changelog

All notable changes to `cklph-audit` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 1.2.1 — 2026-10-26

### Fixed
- **agent-config scope** — the default glob `**/hooks/**` matched app code such as
  `src/hooks/useAuth.ts`; replaced with `**/.claude/hooks/**` and `**/plugins/*/hooks/**`
  (`**/hooks/hooks.json` kept). The job now honors `args.path` (globs are prefixed with it, as
  recon and unit inference scope to it). Recon seeds for the agent-config job are passed through
  unfiltered, so seeds in app code (agent runtime call sites, surface 5) and in scripts a hook runs
  are no longer dropped by the config globs. Engine test scenario C asserts all three.
- **agent-config lens** — `agentcfg:mcp-review` defaulted to severity `info`, which the finding
  schema rejects; now `low` with confidence `needs-owner-input`. The `*.example.*` / `fixtures/**`
  exemption in `SKILL.md` would have suppressed every backtest target; it now covers fixtures in
  ordinary audits only and says fixtures are the targets in a backtest. The should-not-flag
  `pinned-mcp` fixture no longer gives its remote server credentials in `headers` (which
  `agentcfg:mcp-remote` flags). The secret-scan `rg` in `recon.md` prints location only
  (`-o -r '[REDACTED]'`), never the matched secret.
- **HIPAA rulebook** — administrative safeguards, physical safeguards, risk analysis and BAA
  paperwork were promised as `not-checked` but had no controls, so they vanished from the matrix.
  Added owner-evidence controls `hipaa:ADM1`, `hipaa:ADM2`, `hipaa:PHY1`, `hipaa:BA1` (default
  `not-checked`). `hipaa:VB1` reworded so code and docs can only show "no PHI forwarded to vendors
  not on the list", never BAA coverage `met`.
- **Report contract** — `audit-synthesizer`, `audit-report-format` and the README now ask for one
  compliance sub-section per selected framework (SOC 2, CASA, HIPAA). `compliance-lens` and the
  report-format example use the schema status `met`, not `verified-safe`.
- **audit-reviewer** — the agent-config recon and compliance rulebook paths are prefixed with
  `${CLAUDE_PLUGIN_ROOT}/`.
- **tools/dry.sh** — dropped the unpinned `npx jscpd` fallback that fetched from the registry at
  audit time; uses `npx --no-install jscpd` only, like the sibling tools, and skips with a message
  when jscpd is not installed locally.
- **tools/exploit-runner.sh** (opt-in `dast.exploitVerify`) — no longer runs the generated PoC
  with `--network=host`. It runs in a throwaway user-defined bridge network and reaches the target
  through `host.docker.internal` (host-gateway); a localhost target URL is rewritten to it. The
  bridge does not firewall egress; that limit is documented in the script. The target URL is passed
  as `-e TARGET_URL` instead of being interpolated into the shell string. The container runs `sh`
  (the curl image has no bash) and always prints the exit code, so a passing PoC is recorded as 0.
- Docs nits: `quick.md` notes agent-config and docs-drift are not sampled by `topN`; the example
  config says the `agentConfig.globs` override replaces the defaults; the 2026-10-26 proof doc
  escapes `|` inside its findings table and corrects the instruction-docs denominator to 107 (its
  command now excludes the lens's own files, as the doc's exclusions state).

## 1.2.0 — 2026-10-26

### Added
- **`agent-config` lens (opt-in)** — static review of the repo's AI tooling layer: MCP configs
  (mutable `@latest`/dist-tag/bare/range selectors, Docker images without a digest, remote URLs,
  literal secrets, shell-wrapped servers), `.claude` settings (`bypassPermissions`, `Bash(*)`, no
  deny list, MCP auto-trust), hooks (curl-to-bash, absolute paths, tool-input injection, fail-open
  gates), instruction docs/skills/agent definitions (prompt-injection-shaped and auto-run content,
  secrets), and agent runtimes that turn untrusted content into tool actions. Never executes a
  discovered MCP server, hook, or package runner. Runs as exactly one job over the AI-tooling globs
  (`agentConfig.globs` overrides), like `docs-drift`. Rule ids `agentcfg:<kind>`. Skill
  `skills/agent-config-lens/` (+ `checklist.md`, `mcp-selectors.md`, `recon.md`, `trigger-tests.md`),
  fixtures `fixtures/agent-config/should-flag` (5) and `should-not-flag` (5), engine test scenario C
  (one job, glob-scoped, static-only recon prompt, finding reaches the report).
- **HIPAA rulebook (opt-in)** — `skills/compliance-lens/rulebooks/hipaa.yaml`: code-reviewable
  technical safeguards (PHI classification, row-level access, minimum necessary, tamper-evident
  audit trail, encryption, leak vectors, BAA vendor boundary). Select with
  `compliance: { frameworks: [hipaa] }`. `compliance-lens` gains a PHI leak-vector section and
  `agentcfg:*` mapping rows; the compliance schema accepts `framework: hipaa`.
- Adapted from: ECC (MIT) `skills/mcp-dependency-review`, `skills/security-scan`, `skills/agent-security-hardening` (agent-config lens), `skills/healthcare-phi-compliance`, `skills/hipaa-compliance` (HIPAA rulebook), commit 25278e7. Notices in `skills/agent-config-lens/NOTICE.md` and `skills/compliance-lens/rulebooks/NOTICE-hipaa.md`.

## 1.1.1 — 2026-10-26

### Changed
- Public-repo scrub: the security backtest ground truth, v1 acceptance criteria, report-format
  example, README and 0.1.0 entry now describe the reference audit generically (a known
  pre-remediation commit of a production app) instead of naming the product, the audit
  artifact, or its specific findings. Behavior and acceptance thresholds unchanged.

## 1.1.0 — 2026-07-23

### MCP vulnerability intelligence integration

The SCA lens now **auto-detects and uses** `cve-mcp` and `vuln-intel-ext` MCP servers when available,
enriching dependency vulnerability findings beyond what local CLI tools (Trivy/Grype/Syft/OSV-Scanner)
provide. This is a pure enhancement layer — if the MCP tools are not configured, the audit proceeds
normally with local tools only.

**What the MCP enrichment adds:**
- **`diff_since`** (vuln-intel-ext) — delta scan: "what new CVEs appeared for my dependencies since my
  last audit?" Catches vulnerabilities that local tool DBs haven't ingested yet.
- **`save_dependency_snapshot`** (vuln-intel-ext) — registers your dependency list for delta tracking
  across audit runs.
- **`cve_enrich`** (cve-mcp) — parallel enrichment from 8 sources: NVD (CVSS/CWE/CPE), EPSS
  (exploitation probability), CISA KEV (exploited-in-the-wild), Nuclei (detection template),
  Metasploit (exploit module), AttackerKB (community assessment).
- **`cve_prioritize`** (cve-mcp) — risk-score ranking: `CVSS × EPSS × KEV-multiplier ×
  Exploit-multiplier`. Used to severity-calibrate findings — a CVE in CISA KEV with a Metasploit
  module and EPSS > 80% is CRITICAL regardless of CVSS alone.
- **`exploit_search`** (cve-mcp) — checks for public PoC exploit code on GitHub.
- **`wp_scan`** (vuln-intel-ext) — WordPress vulnerability lookup (the one ecosystem OSV doesn't
  cover).

**How it changes SCA findings:**
- CISA KEV listed → severity CRITICAL (actively exploited)
- EPSS > 70% → bump severity one level
- Metasploit module exists → `confidence: confirmed` + "weaponized" note
- diff_since new vuln → added to candidates even if local DB missed it
- Advisory withdrawn → finding dropped, noted in report

**Feed-refresh skill enhanced:**
- Uses `feed_status` from vuln-intel-ext for live API reachability + last-scan history
- Uses `diff_since` after local DB refresh to catch CVEs published between DB update and now

**Engine changes:**
- New config key: `vulnIntel: { enabled: auto }` (default `auto` — use MCP tools if available, fall
  back to local tools if not; `true` = require; `false` = skip)
- SCA reviewer prompt includes MCP enrichment hint when enabled
- Self-review checks whether MCP enrichment was used (flags as gap if SCA ran but MCP wasn't used)
- Return value includes `vulnIntel` metadata

**Files changed:**
- Updated: `skills/sca-lens/SKILL.md` (MCP enrichment section with 4-step process + impact table)
- Updated: `skills/feed-refresh/SKILL.md` (MCP feed_status + delta scan sections)
- Updated: `workflows/audit.workflow.js` (vulnIntel config, SCA prompt hint, self-review check, return value)
- Updated: `templates/audit.config.example.yaml` (vulnIntel config section)

## 1.0.0 — 2026-07-23

The **comprehensive security suite** release. Transforms cklph-audit from a "very good audit tool"
into a full enterprise-class security suite — covering every layer from source code to cloud
infrastructure, with dynamic verification, automated patching, compliance mapping, and adversarial
self-review. Backward-compatible: a v0.3 `audit.config.yaml` runs unchanged (every new key defaults
off-but-safe).

### Nine new lenses

- **sca** — Software composition analysis: dependency CVEs (Trivy/Grype/Syft/OSV-Scanner),
  transitive depth, abandoned/malicious packages, license risk. Judge by reachability.
- **iac** — Infrastructure-as-code misconfig (Checkov/KICS/tfsec): public S3 buckets, open security
  groups, IAM over-permission, unencrypted storage, missing logging. Terraform/CFN/Pulumi/Dockerfiles.
- **container** — OCI image scanning (Trivy/Grype/dive/hadolint): vulnerable base images, secrets in
  layers, root/privileged, missing healthcheck, unpinned digests.
- **k8s** — Kubernetes manifest scanning (Kubescape/kube-bench/kube-hunter): RBAC over-permission,
  privileged pods, hostPath mounts, missing network policies, pod security standards.
- **supply-chain** — CI/CD pipeline security (semgrep CI): `pull_request_target` with secrets, unsigned
  artifacts, SLSA gaps, dependency confusion, typosquatting.
- **compliance** — SOC 2 Trust Services Criteria + CASA cross-mapping. Produces a compliance matrix
  (every control → met/violation/not-applicable/not-checked). NOT HIPAA — explicitly excluded.
- **concurrency** (T3.3) — Every check→use gap, TOCTOU, web race conditions (single-packet attacks),
  atomicity violations, deadlock potential. Pure reasoning.
- **state-machine** (T3.3) — Reachable-but-unintended state transitions, missing terminal states,
  non-idempotent transitions. Pure reasoning.
- **economic** (T3.3) — Value-bearing flow analysis: money/entitlement/privilege paths where the
  economic incentive is the attack vector. Pure reasoning.

### SAST recall for the security lens

- `sast.sh` wraps Semgrep (security-audit + owasp-top-ten rulesets) + optionally CodeQL. The security
  lens now runs it FIRST for exhaustive injection/SSRF/XSS/deserialization/path-traversal recall.
- `cpg.sh` for cross-file reachability queries (Joern or grep-fallback).

### DAST + exploit-to-confirm (opt-in, sandboxed — the CodeMender core)

- **`audit-dast-runner`** agent boots the app (Docker Compose / local dev / provided URL), runs
  ZAP/Nuclei/ffuf, collects runtime findings (auth bypass, session, IDOR, headers, rate limits).
  DAST findings re-enter the same adversarial verify gate.
- **`audit-exploit-verifier`** agent generates PoC exploit scripts for confirmed critical/high findings
  with reachability traces, runs them in an isolated Docker sandbox. A finding is only
  `confirmed-exploitable` if the PoC succeeds.
- Config: `dast: { enabled: false, sandbox: "docker", target: "auto", tools: ["zap","nuclei","ffuf"], exploitVerify: true }`
- OFF by default — breaks the read-only constraint. Explicit opt-in only.

### Patch generation + validation (opt-in, auto-on with DAST)

- **`audit-patcher`** agent generates a code patch addressing the root cause, applies it in a sandbox
  git worktree, runs the test suite, re-runs the exploit (must FAIL — vuln closed), and runs an
  LLM-as-judge pass. Up to 3 iteration rounds.
- Config: `patch: { enabled: false, maxIterations: 3 }`
- Patches are proposals for developer review, not auto-merges.

### Adversarial self-review (the "check itself" loop)

- After synthesis, an `audit-reviewer` re-reads the report for gaps — missed areas, under-explored
  crown jewels, coverage narrative honesty. Gaps surfaced in the appendix.
- Default true in full mode; up to `selfReview.maxRounds` (default 2) rounds.
- Config: `selfReview: { enabled: true, maxRounds: 2 }`

### SOC 2 + CASA compliance matrix

- The compliance lens runs as a single post-reconcile mapping job, taking aggregated confirmed
  findings from all other lenses and mapping them to SOC 2 TSC + CASA controls.
- Rulebooks: `skills/compliance-lens/rulebooks/soc2-tsc.yaml`, `casa.yaml`.
- Every control → `met` (cite guard) / `violation` (link finding) / `not-applicable` (reason) /
  `not-checked` (gap requiring manual evidence for attestation).
- Config: `compliance: { frameworks: [soc2, casa] }`

### Feed freshness checks

- `feed-status.sh` checks CVE database age and tool versions.
- `/cklph-audit:refresh-feeds` command + `feed-refresh` skill updates vulnerability feeds and checks
  for new tools/CVE sources.
- Report appendix warns if feeds are stale.
- Config: `feedRefresh: { maxAgeHours: 24, autoRefresh: true, sources: [nvd, ghsa, osv] }`

### Tier 3 roadmap items — shipped

- **T3.1** `git-hotspots.sh` — churn × complexity + temporal coupling as a `riskScore` input.
- **T3.2** `cpg.sh` — Joern or grep-fallback for cross-file reachability queries.
- **T3.3** Three "weird-machine" lenses: concurrency, state-machine, economic.
- **T3.4** Ensemble panels for crown-jewel units: `ensemble: { enabled: false, models: [], riskGate: 0.8 }`.
- **T3.5** Exploit-to-confirm (the DAST + exploit-verifier phase above).

### Engine changes (audit.workflow.js v4)

- Phases: Discover → Recon → Map → Review → Verify → DAST (opt-in) → Reconcile → Variant →
  Patch (opt-in) → Synthesize → SelfReview.
- 5 new schemas: `DAST_SCHEMA`, `EXPLOIT_SCHEMA`, `PATCH_SCHEMA`, `COMPLIANCE_SCHEMA`,
  `SELF_REVIEW_SCHEMA`.
- `RULEBOOK_SCHEMA.lensHint` enum expanded with all new lenses.
- `compliance` filtered from recon phase (post-reconcile mapping job, not a scanning lens).
- Synthesize call passes DAST findings, exploit results, patch results, compliance matrix.
- SelfReview phase: adversarial review of the report for gaps, up to `maxRounds` iterations.
- Return value includes `dast`, `patch`, `compliance`, `selfReview` metadata.

### Files changed

- 11 new bash tools: `sca.sh`, `sast.sh`, `iac.sh`, `container.sh`, `k8s.sh`, `supplychain.sh`,
  `feed-status.sh`, `dast.sh`, `exploit-runner.sh`, `git-hotspots.sh`, `cpg.sh`
- 9 new lens SKILL.md files: `sca-lens`, `iac-lens`, `container-lens`, `k8s-lens`, `supply-chain-lens`,
  `compliance-lens`, `concurrency-lens`, `state-machine-lens`, `economic-lens`
- 2 compliance rulebooks: `soc2-tsc.yaml`, `casa.yaml`
- 3 new agents: `audit-dast-runner.md`, `audit-exploit-verifier.md`, `audit-patcher.md`
- 1 new skill + 1 new command: `feed-refresh/SKILL.md`, `refresh-feeds.md`
- 6 new fixture directories with should-flag + should-not-flag cases
- Updated: `security-lens/SKILL.md`, `audit-modeler.md`, `audit-reviewer.md`,
  `audit-report-format/SKILL.md`, `audit-synthesizer.md`, `README.md`, `plugin.json` (→1.0.0),
  `marketplace.json`, `audit.config.example.yaml`

## 0.3.4 — 2026-07-20

- **Verifier fan-out cap** (`verify.maxVerifierAgents`, default 400). Verify is the dominant,
  findings-UNBOUNDED term — on a large repo `Σfindings × voters` plus the Variant phase's
  `candidates × voters` could exceed the Workflow runtime's **1000-agent lifetime cap** and abort the
  whole run. (The v3 additions — the Variant phase's second verifier fan-out and risk-routing's extra
  voters — made this reachable.) The engine now bounds total verifier spawns across the run (main
  pipeline + Variant share one counter); critical/high are verified first so they claim the budget,
  and overflow candidates are **DEFERRED — unverified and SURFACED** in a distinct report section,
  never silently dropped. Deferred items are honestly labelled as unverified leads (they never faced
  a refuter, so may include false positives) with a recommendation to re-run at a higher
  `maxVerifierAgents` or narrower scope. New return field `deferred`, run-summary line, and
  `RUN_META.deferredCount/verifierBudget/verifierSpawns`. Found + proven by the deterministic
  `tests/engine-flow.test.mjs` (a cap scenario asserts the budget holds, overflow is surfaced not
  dropped, and critical/high are prioritized).

## 0.3.3 — 2026-07-20

- Fix: the **Coverage matrix could cite findings that aren't in the report**. `ruleChecks` come from
  the reviewer (pre-verification), and rule-closure trusted their `findingIds` verbatim — so a rule
  the reviewer marked `violation` could point at a finding that verification later *refuted* (gone) or
  *held-untraced* (in a different section). Rule closure now runs AFTER verification and reconciles
  each violation's findingIds against what survived: it cites only confirmed findings; a violation
  whose evidence survived only as held-untraced is marked `heldBacked` and points at the Held-untraced
  section (which now carries finding ids); a violation whose evidence was fully refuted degrades to
  inconclusive rather than masquerading as a confirmed violation. Found by a deterministic end-to-end
  engine harness (real engine body, stubbed agents) driving the full seven-phase data flow.

## 0.3.2 — 2026-07-19

- **Hard-blocker fix:** the audit workflow dispatched every sub-agent by BARE name
  (`agentType: 'audit-scout'`), but the runtime registry namespaces plugin agents as
  `cklph-audit:audit-scout`. All 9 dispatch sites are now namespaced. `/cklph-audit:run`
  failed 100% of the time on any repo — latent since v1 and only surfaced on the first real
  run because `parallel()` silently resolves a failed agent to `null`, so the scout/recon/
  rulebook failures were swallowed and the crash only surfaced at the first directly-awaited
  agent (`audit-unit-mapper`), disguising a universal bug as a unit-mapper issue.

## 0.3.1 — 2026-07-19

- Fix: init/scout emitted stale framework conventions and could **miss `proxy.ts`** — the
  Next.js 16 rename of `middleware.ts` (function `middleware` → `proxy`; `middleware.ts` is now
  deprecated). On a Next 16 repo the scout could look for a root `middleware.ts`, report its
  absence as noteworthy, and drop the highest-value auth file from the auth unit. The scout +
  audit-init now **detect the framework version from `package.json` and apply that version's
  conventions** (naming `proxy.ts` explicitly), and treat a missing `middleware.ts` as a
  non-event. The example config's auth unit includes `proxy.ts` / `src/proxy.ts`. Affects every
  Next.js 16 repo.

## 0.3.0 — 2026-07-18

The master-practice upgrade. v1 was a repeatable engine; v2 made it prove what it covered;
0.3.0 hardens the precision bet and adds the master-practitioner mechanics — model before you
read, trace symptom → root cause, hunt a confirmed bug's siblings, and route depth by blast
radius. Still read-only. The pipeline grows from five phases to **seven**:
Discover → Recon → **Map** → Review → Verify → **Variant** → Synthesize. See `SPEC-v3.md`.
Implements the roadmap's §1 correction, Tier 1 (T1.1–T1.4), and Tier 2 (T2.1–T2.3); **Tier 3
stays the live backlog**.

### Added

- **Map phase (T2.1) — model before you read.** A new `audit-modeler` agent runs once, between
  Recon and Review, emitting a lightweight threat model: **trust boundaries**
  (`{ id, where, note }` — where a security control gates a connection), **data-flows**
  (`{ source, sink, crossesBoundary }` — routes → sinks), **per-unit invariants**
  (`{ unit, text }` — properties that must hold), and **crown jewels** (highest-value
  assets/flows). Reviewers then get their unit's invariants (a violation is a finding) and the
  boundaries gating them (security findings SHOULD cite the `boundary` crossed). Skips in
  `:quick`; a dead modeler degrades to an empty model — both flagged in the report appendix,
  never silent. This is the phase-ordering elite firms use (design → threat model → then code).
- **Variant analysis (T1.1) — one finding becomes its family.** After the first reconcile, each
  confirmed critical/high finding seeds a Project-Zero-style sibling hunt: an `audit-reviewer`
  runs `tools/variant-sweep.sh` for deterministic recall, then judges the candidates — the same
  mistake elsewhere in the repo. Siblings re-enter the SAME verify gate (a factored
  `verifyFindings()` helper the main pipeline and this phase share), then dedup + baseline-
  suppress. Capped at `variant.maxSeeds` (8) seeds × `variant.maxPerSeed` (20) siblings. Skips
  in `:quick`; flagged in the appendix.
- **Root cause + violated invariant in the finding schema (T1.2).** `REVIEW_SCHEMA` findings
  gain `rootCause` (the underlying fault, not the symptom), `invariant` (the property the code
  should guarantee that this violates), and `boundary` (the trust boundary crossed, when the Map
  ran). The reviewer prompt must trace symptom → root cause, name the violated invariant, and
  **reject a `suggestedFix` that only patches the symptom**. These ride the finding object
  through verify → reconcile → synthesizer and render per finding.
- **Coverage narrative (T2.2) — positive assurance.** Reconcile now collects **near-misses**
  (refuted critical/high candidates whose counter-evidence tells the coverage story — "probed X,
  held because Y"), and passes them plus crown jewels + coverage totals to the synthesizer, which
  writes a per-area narrative: what was probed, why clean areas held, and which near-misses were
  chased to ground. A clean area with no narrative is treated as un-reviewed — the Cure53
  positive-assurance model, not "we found nothing."
- **Omission lens (T2.3) — negative space.** New opt-in `omission` lens + `tools/omissions.sh`:
  per external input / IO / branch, assert `{ validation? error-path? logging? rollback? test? }`
  and report the MISSING ones. Rule ids `omission:<kind>`; severity by real impact. The thing
  linters and pure-LLM passes miss most — the code that isn't there.

### Changed

- **Verify is now arbitrated by evidence, not the vote tally (§1 correction + T1.3).** Majority-
  refute voting carries a conservative-verdict bias and consensus ≠ truth (in one study 80+
  agents endorsed a non-existent vuln). So: `VERDICT_SCHEMA` gains `reachabilityTrace`; before a
  finding reaches a verifier its snippet is **comment-stripped** (`stripComments()` — "re-derive
  from code alone, ignore comments/labels"; LLMs anchor on reassuring comments). A voter that
  CONFIRMS a critical/high MUST supply a `reachabilityTrace` (attacker-input → sink, or the
  invariant-violation path) — "plausible" without a trace is refuted. Promotion:
  **low/medium keep the majority rule; critical/high require a trace** (the winning trace, or the
  reviewer's `validationSteps`, rides onto the finding). To refute, a voter cites the guard
  `file:line` in `counterEvidence`. The vote is now recall signal, not the decider.
- **Review depth is risk-routed (T1.4).** Verifier voter count (and optionally effort) scales
  with the unit's `riskScore` via a new `riskRouting` config block: high-risk units
  (`riskScore ≥ highThreshold`) get `base + highVotersDelta` voters (and effort `high` when not
  pinned in config); low-risk units (`≤ lowThreshold`) get `base + lowVotersDelta` (floored at
  1). Each routing decision is logged per unit. Crown-jewel code gets deep scrutiny; a log tweak
  gets a glance.
- **Phases** are now Discover → Recon → Map → Review → Verify → Variant → Synthesize (reconcile
  stays plain code between Verify and Variant: dedup + baseline suppression + rule closure +
  coverage totals + near-miss + positive-control harvest). The engine return gains
  `map: { ran, trustBoundaries, invariants }` (counts) and `variants` (count confirmed); the run
  summary prints whether the Map ran (+ boundaries found) and how many variants were confirmed.
- **No-silent-truncation extends to the two new phases** — a skipped or degraded Map/Variant is
  stated in the report appendix (why it was skipped, or that the modeler died), never silent.

### Backward compatibility

A v1/v2 `audit.config.yaml` runs with **no config changes required**: every new key defaults
on-but-safe. **One real behavior change:** `riskRouting.enabled` defaults true, so voter counts now
scale with a unit's risk — high-risk units get more voters, low-risk ones fewer — meaning a v1/v2
config votes differently than under uniform voting; set `riskRouting.enabled: false` to restore it.
`map.enabled` and `variant.enabled` default true (both skip in `:quick`), and the `omission` lens is
opt-in (never in the defaults). `:quick` skips Map + Variant to stay cheap.

## 0.2.1 — 2026-07-16

- Fix: `docs-drift-lens` SKILL.md frontmatter failed YAML parsing (unquoted `:` in the
  description) — the skill would have loaded with empty metadata at runtime. Caught by
  `claude plugin validate` during release tagging; description now quoted.

## 0.2.0 — 2026-07-16

The coverage upgrade. v1 was a repeatable engine; 0.2.0 is the same engine that can also
show what it covered — completeness accounting ported from the ZenCoder audit
methodology. Still read-only. See `SPEC-v2.md`.

### Added

- **Recon phase** — new `audit-recon` agent, one per lens, dispatched in parallel with the
  scout. Returns **denominators** (`{ pattern, command, count }` — the exact enumeration
  command, recorded verbatim in the report appendix so it's re-runnable), **seeds** (cited
  leads; hints, not findings — reviewers must re-verify every one, citations drift), and
  **safe-control candidates**. Skipped in `:quick` unless `recon.quick: true`; the skip is
  logged and stated in the report appendix, never silent.
- **Rulebook + rule-closure coverage matrix** — the same agent (rulebook mode) parses the
  `rulesFrom` docs (`CLAUDE.md`/`AGENTS.md`) into discrete rules with stable IDs. Reviewers
  return a `ruleCheck` for every rule handed (`violation` / `verified-safe` /
  `not-applicable`, each with evidence or a reason); plain-code reconciliation folds them so
  the report renders a matrix row for EVERY rule — including an honest `NOT CHECKED` for
  anything no reviewer touched. Closure: no rule may be silently absent.
- **Denominator coverage math** — reviewers report
  `{ seedsVerified, seedsGiven, toolCandidatesJudged }`; the report's Coverage summary
  states `examined X / N` per denominator (+ command), and says "sampled" plainly where
  X < N, with the risk-weighting rationale.
- **Positive controls (INFO)** — verifier refutations that cite a concrete guard,
  `verified-safe` rule checks, and reviewer-confirmed recon safe controls ship as a
  "checked and clean" report section (citation + what it protects). Noise-gated — must
  attach to a rulebook rule or be the counter-evidence that killed a critical/high
  candidate — and capped at `positiveControls.max` (default 15; 0 disables). This
  knowledge previously evaporated every run.
- **`docs-drift` lens** — audits the rulebook itself against reality: `tools/docsdrift.sh`
  (deterministic recall: path tokens, script names, scoped package names — `@scope/pkg`;
  unscoped tech-name prose is the judgment layer's job — vs the tree /
  `package.json`) + a judgment-layer skill (real drift vs glob/abbreviation vs
  intentional). Opt-in, never in the defaults; when requested the engine adds exactly ONE
  job over the `rulesFrom` docs — not crossed with units. LOW severity by default, MEDIUM+
  only when the drift misleads a security control.
- **Richer finding schema** — findings gain `confidence`
  (`confirmed`/`likely`/`needs-owner-input`), `validationSteps` (the read-only checks that
  confirmed true-positive), `remediationBucket`
  (`quick-win`/`targeted-fix`/`systemic-refactor`/`owner-decision`), and `context`
  (surface/runtime/gated) — classified BEFORE severity, so severity comes from real
  exploitability, not raw pattern match. `owner-decision` items render as questions in
  their own waves subsection, not scheduled work.
- **Per-stage model routing** — `config.models.<stage>` optionally sets `{ model, effort }`
  per engine stage (scout/recon/rulebook/reviewer/verifier/unitMapper/synthesizer), passed
  through to the Workflow `agent()` opts. Suggested policy in the config template:
  mechanical stages at low effort, judgment stages inherit the session model, the verifier
  at high effort. Omit the block to inherit everywhere (v1 behavior).

### Changed

- **Phases** are now Discover → Recon → Review → Verify → Synthesize (reconcile stays
  plain code: dedup + baseline suppression + rule closure + coverage totals +
  positive-control harvest).
- `FINDINGS_SCHEMA` → `REVIEW_SCHEMA` (findings + `ruleChecks` + `coverage`); report
  `counts` gains `info`; the run summary prints rule closure ("rulebook N rules: X
  checked, Y NOT CHECKED") and the positive-control count.
- **No-silent-truncation now extends from units to rules and patterns** — budget-killed
  recon means the appendix says denominators are partial; unchecked rules render as
  `NOT CHECKED`.

### Backward compatibility

A v1 `audit.config.yaml` runs unchanged: `recon.enabled` defaults on,
`positiveControls.max` defaults to 15, `:quick` skips recon (quick stays cheap), and
`docs-drift` runs only when explicitly requested.

## 0.1.0

First release — the productized version of a hand-run 8-agent pre-certification security audit.
Scoped, adversarially-verified, agentic whole-repo audits. **Read-only in v1** (no agent
modifies application code; the only writes are the report + baseline).

### Added

- **Plugin scaffold** — `.claude-plugin/plugin.json`, README, SPEC; CLI-only (sub-agents + workflows).
- **3 lenses** — `security` (CWE/ASVS/OWASP: authz, injection, secrets, SSRF, RLS/row-scoping,
  money & privilege paths), `correctness` (silent failures, state-machine catch gaps, TOCTOU/races,
  null/off-by-one, fail-open defaults), and `architecture` (DRY/duplication, layering, dead code,
  circular deps, god-objects, size limits). Each layers over the repo's own `CLAUDE.md`/`AGENTS.md` rules.
- **5 agents** — `audit-scout` (fast unit inference + per-unit confidence), `audit-unit-mapper`
  (deep mapping, escalated only when inference is low-confidence), `audit-reviewer`
  (per-unit×lens deep review, runs the lens's tool first), `audit-verifier` (dedicated,
  default-to-refuted adversary for precision), `audit-synthesizer` (dedup-aware report + waves).
- **Workflow engine** — `audit.workflow.js`: deterministic Discover → Review → Verify →
  Synthesize, with Review→Verify as a pipeline (a unit verifies as soon as its review lands)
  and N-voter majority-refute verification.
- **Adaptive unit scoping** — scout infers units fast with confidence scores; escalates to
  `audit-unit-mapper` when overall confidence is low, a unit self-flags `needsDeepMap`, or
  `--deep-units` is passed; an explicit `units.list` in config always wins. Derivation method
  and low-confidence units are flagged in the report so they can be pinned next run.
- **Dedicated verifier** — purpose-built `audit-verifier` (not a red-team wrapper):
  default-to-refuted, finding-schema-aware, majority-confirm-to-survive. The core precision bet.
- **Baseline / delta** — `.audit-baseline.json` + `/cklph-audit:baseline` accepts open findings
  with a per-finding reason; fingerprints are line-number-independent (stable across code moves),
  so re-runs surface only what's NEW and accepted debt never resurfaces.
- **Tool-augmented lenses** — deterministic detectors drive recall before the LLM judges:
  `tools/dry.sh` (jscpd), `tools/await.sh` (eslint no-floating-promises + tsc),
  `tools/deadcode.sh` (knip/ts-prune), `tools/layering.sh` (dependency-cruiser),
  `tools/secrets.sh` (gitleaks/detect-secrets). Each degrades gracefully when the binary is
  absent so the reviewer can fall back to reasoning.
- **Fixtures + backtest validation** — golden `fixtures/<lens>/{should-flag,should-not-flag}/`
  ground truth and `/cklph-audit:backtest <lens> [ref]` compute precision/recall against
  fixtures and historical commits. A lens is gated (suggested recall ≥ 0.8, precision ≥ 0.7
  after verify) before it's trusted; fixtures grow as real false-pos/neg are found.
- **Commands** — `/cklph-audit:init`, `:run <lenses> [path]`, `:quick <lens> [path]`,
  `:baseline`, `:backtest <lens> [ref]`.
- **Config + reports** — `audit.config.yaml` (units, lenses, severityFloor, verify, budget,
  quick, ignore, report, rulesFrom) and git-trackable `audits/AUDIT-<date>.md` reports with
  severity buckets, file:line, verifier notes, remediation waves, and a no-silent-truncation
  appendix.

### Notes

- **Cost-bounded** — token budget, `:quick` top-N risk sampling, and dedup/baseline make
  re-runs cheap. Partial reports still emit with a "skipped for budget" appendix.
- **Not for per-PR review** — that's diff review's job. This is a periodic, before-a-milestone
  deep pass.
- v2 (planned): `performance` + `a11y` + `compliance` lenses, scheduled weekly delta audits,
  a pre-promotion CLI gate, and auto-handoff of confirmed Criticals into `/cklph-os:flow`.
