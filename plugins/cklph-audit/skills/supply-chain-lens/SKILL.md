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

**Split with `agent-config`.** When both lenses run, the AI agent step itself (its prompt inputs, its tools, what later steps do with its output) belongs to `agent-config` under its `agentcfg:ci-agent-*` rows, and so do the job's `permissions:` and the secrets passed to the agent step (`agentcfg:ci-agent-privileged`). Every other sink in the same job stays with `supply-chain`: action pinning, `npm install` on a PR head with secrets, a `pull_request_target` checkout that runs repo scripts, `${{ }}` in a non-agent `run:` step. When `agent-config` is not in the run, file the agent step here too under the closest `supplychain:*` rule and name the agentcfg rule in the rationale.

- **`pull_request_target` with secrets** — the classic injection: this trigger runs with the base branch's secrets but the PR's code. An external contributor can exfiltrate secrets. (`supplychain:pull-request-target`, CRITICAL if secrets are referenced.)
- **Fork PR with write access** — workflows that run on `pull_request` from forks with elevated permissions. (`supplychain:fork-pr-privileged`.)
- **Third-party actions without pinning** — `uses: owner/repo@main` instead of `@sha256:...`. A compromised action update = supply chain attack. (`supplychain:unpinned-action`, HIGH.)
- **Secrets in CI logs** — secrets echoed in workflow steps, or `ACTIONS_STEP_DEBUG` enabled. (`supplychain:secrets-in-ci`.)
- **No artifact signing / SLSA** — unsigned artifacts, no provenance attestation. (`supplychain:unsigned-artifact`, `supplychain:slsa-gap`.)
- **Dependency confusion** — internal-scoped packages (`@company/pkg`) that could be registered on public npm. (`supplychain:dependency-confusion`.)
- **Typosquatting** — dependencies whose names closely resemble popular packages but are from different publishers. (`supplychain:typosquat`.)
- **No branch protection** — main branch can be pushed to directly, no required reviews. (`supplychain:no-branch-protection`.)

### Trust handoffs (judgment, no scanner rule)

Core discipline for these:
- CI config is authorization code. For each workflow, state which event triggers it, whose code runs, which secrets and tokens exist, and what it can publish or change.
- A mutable or vulnerable dependency is not a finding by itself. Show who can influence what gets resolved, which build consumes it, and what boundary follows.
- A checksum fetched from the same place as the artifact proves nothing. Name the independent trust root.
- Branch protection, runner settings, registry and signing-service config usually live outside the repo. When the finding depends on them, set `confidence: "needs-owner-input"` and name the setting.

- **Expression injection**: `${{ github.event.* }}` (issue title, PR body, branch name, commit message) interpolated straight into a `run:` script or `github-script`, so an outsider's text becomes shell or JS. Pass it through `env:` and quote it. (CWE-78, `supplychain:expression-injection`, HIGH when the job holds secrets or write tokens.)
- **Cache and artifact trust mixing**: an untrusted job (fork PR, `pull_request`) writes a cache key or artifact that a privileged job (release, deploy, `main` push) restores. (`supplychain:cache-poisoning`.)
- **Automation identity overreach**: `permissions: write-all` or no `permissions:` block, a PAT where `GITHUB_TOKEN` would do, or a cloud OIDC trust policy whose `sub` condition accepts any branch, PR, or repo. (`supplychain:token-overreach`.)
- **Build-to-release substitution**: the artifact that ships is rebuilt, re-downloaded, or picked by a mutable name (`latest`, branch) after tests passed, so what was tested is not what is released. (`supplychain:promotion-substitution`.)
- **Mutable build inputs**: `curl … | sh` in CI or a Dockerfile, tools fetched by tag instead of checksum, `npx pkg@latest` in a build or release step. (`supplychain:mutable-input`.)
- **Build context leaks**: `.env*`, keys, or server-only config copied into an image, or a published package (`files`/`.npmignore` gaps). A secret in a client bundle or `NEXT_PUBLIC_*` is `client-side:client-exposure`. (CWE-540, `supplychain:build-context-leak`.)
- **Slopsquatting (AI-hallucinated packages)**: a newly added dependency that does not exist on the registry, was first published under 30 days ago, has one maintainer and low downloads, or closely resembles a known package while differing from the name the docs or imports suggest. Recall: list newly added dependencies from `git log -p -- package.json` or the lockfile diff. Registry age, maintainers, and downloads live outside the repo. Never run a network command yourself. Set `confidence: "needs-owner-input"` and put the exact check for the owner in `validationSteps`, for example `npm view <pkg> time.created maintainers`. A name that resembles a popular package from another publisher is `supplychain:typosquat`. (`supplychain:slopsquat`.)
- **Install integrity**: CI installs with `npm install` instead of `npm ci`, or with Yarn 1 `yarn install` without `--frozen-lockfile`, so the lockfile is not enforced and CI can resolve versions nobody reviewed. `pnpm install` already defaults to `--frozen-lockfile` in CI, and Yarn 2+ defaults to immutable installs in CI, so a bare install with either is not this rule unless the workflow turns that off (`--no-frozen-lockfile`, `--no-immutable`). Install scripts run in a job that holds secrets where `--ignore-scripts` would work. A private scope with no scoped registry line in `.npmrc` is the dependency confusion vector: file it under `supplychain:dependency-confusion` above, not here. (`supplychain:unlocked-install`.)
- **Test weakening in automated or agent-authored changes**: history where a security path (auth, authz, validation, signing, payment) changed and its tests were deleted, given `.skip` or `.only`, had assertions loosened or removed, or had a snapshot widened. The suite stays green while the guard it proved is gone. The audit runs on HEAD with no diff, so recall comes from history: `git log -p -n 200 -G '\.(skip|only)\(|expect\(|assert' -- '*.test.*' '*.spec.*' '**/__tests__/**' '**/tests/**' '**/test/**'`. Anchor the finding at the HEAD lines of the weakened test (or of the covered code when the test is gone). The evidence is the commit that weakened the test together with the commit that changed the covered code, which may be the same commit; cite both hunks. Look hardest at bot or agent branches and PRs. A test moved or renamed with the same assertions is not a finding. (`supplychain:test-weakening`.) Idea from promptfoo's coding-agent verifier-sabotage tests and the OWASP AI Agent Security cheat sheet.
- **Plugin and extension trust expansion**: a plugin, skill, hook, or extension the project ships or installs gains capabilities on update (new hooks, new MCP servers, broader tool grants) without a review gate or pin; or a marketplace entry tracks a moving ref. (`supplychain:plugin-trust-expansion`.) Cross-check `agent-config` for the static config itself.

Class list adapted from Cloudflare's security-audit skill (MIT); see the plugin's `NOTICE.md`.

## Compose with the repo's own rules

Load the repo's CI/CD rules from `CLAUDE.md` / `AGENTS.md`. Prefer the repo's rule on conflict. Return a ruleCheck for every rule handed.
