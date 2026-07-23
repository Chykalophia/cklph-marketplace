---
name: supply-chain-lens
description: The supply-chain/CI-CD lens — pipeline injection (pull_request_target + secrets), poisoned GitHub Actions, unsigned artifacts, SLSA level gaps, dependency confusion, typosquatting. Wraps semgrep CI rules + grep checks for recall; the reviewer judges real exploitability. Loaded by audit-reviewer when auditing through the supply-chain lens.
---

# supply-chain-lens — CI/CD pipeline security judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline.

1. **Deterministic tool → recall.** Run `${CLAUDE_PLUGIN_ROOT}/tools/supplychain.sh` — wraps semgrep CI rules (`p/github-actions`), grep checks for `pull_request_target`, dependency confusion, SLSA/signing. Emits JSON lines: `{ tool, rule, severity, file, line, rationale }`.
2. **You (reviewer LLM) → judgment.** Judge by real risk — can an external contributor trigger this? Can a fork run privileged workflows? Are artifacts signed/verified?
3. **Verifier → precision.** A separate `audit-verifier` refutes every finding.

Gated by `fixtures/supply-chain/should-flag` / `should-not-flag`; recall ≥ 0.8, precision ≥ 0.7 after verify.

## Checklist (the judgment layer)

Map every finding to a `supplychain:*` rule id and SLSA level where applicable.

- **`pull_request_target` with secrets** — the classic injection: this trigger runs with the base branch's secrets but the PR's code. An external contributor can exfiltrate secrets. (`supplychain:pull-request-target`, CRITICAL if secrets are referenced.)
- **Fork PR with write access** — workflows that run on `pull_request` from forks with elevated permissions. (`supplychain:fork-pr-privileged`.)
- **Third-party actions without pinning** — `uses: owner/repo@main` instead of `@sha256:...`. A compromised action update = supply chain attack. (`supplychain:unpinned-action`, HIGH.)
- **Secrets in CI logs** — secrets echoed in workflow steps, or `ACTIONS_STEP_DEBUG` enabled. (`supplychain:secrets-in-ci`.)
- **No artifact signing / SLSA** — unsigned artifacts, no provenance attestation. (`supplychain:unsigned-artifact`, `supplychain:slsa-gap`.)
- **Dependency confusion** — internal-scoped packages (`@company/pkg`) that could be registered on public npm. (`supplychain:dependency-confusion`.)
- **Typosquatting** — dependencies whose names closely resemble popular packages but are from different publishers. (`supplychain:typosquat`.)
- **No branch protection** — main branch can be pushed to directly, no required reviews. (`supplychain:no-branch-protection`.)

## Compose with the repo's own rules

Load the repo's CI/CD rules from `CLAUDE.md` / `AGENTS.md`. Prefer the repo's rule on conflict. Return a ruleCheck for every rule handed.
