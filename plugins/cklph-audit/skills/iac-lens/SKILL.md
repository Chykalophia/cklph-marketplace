---
name: iac-lens
description: The Infrastructure-as-Code lens — Terraform/CloudFormation/Pulumi/Dockerfile misconfiguration (public resources, open security groups, IAM over-privilege, unencrypted storage, missing logging). Wraps Checkov/KICS/tfsec/Trivy-config for recall; the reviewer judges real exposure. Loaded by audit-reviewer when auditing through the IaC lens.
---

# iac-lens — infrastructure misconfiguration judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. The pipeline is:

1. **Deterministic tool → recall.** Run the lens tool first; it enumerates IaC misconfigurations exhaustively across Terraform, CloudFormation, Pulumi, Dockerfiles, Helm, and ARM.
2. **You (reviewer LLM) → judgment.** Decide which misconfigs are real risks here (prod vs staging, public vs private resource, blast radius).
3. **Verifier → precision.** A separate `audit-verifier` refutes every finding. Recall comes from the tool.

This lens is **gated by the fixture precision/recall test** (`fixtures/iac/should-flag` / `should-not-flag`; recall ≥ 0.8, precision ≥ 0.7 after verify).

## TOOL

- **Run `${CLAUDE_PLUGIN_ROOT}/tools/iac.sh`** on the unit's globs. Wraps Checkov, KICS, tfsec, Trivy config. Emits JSON lines: `{ tool, rule, severity, file, resource, rationale }`.
- The tools are exhaustive for known IaC misconfig patterns; your job is **exposure judgment** — a "public" S3 bucket behind a CloudFront distribution with OAI is different from a truly public bucket. Judge the real attack surface, not just the pattern match.

## Checklist (the judgment layer)

Map every finding to a CIS benchmark control and/or an `iac:*` rule id.

- **Public resources** — S3 buckets, RDS snapshots, ECR repos, storage accounts open to the internet. Is there a CDN/WAF in front? Is the data sensitive? (`iac:public-resource`, CIS AWS 2.1-2.3.)
- **IAM over-privilege** — `*` actions, `*` resources, admin policies attached to roles used by services. Least-privilege check. (`iac:iam-overprivilege`, CIS AWS 1.3-1.4.)
- **Unencrypted storage** — S3/RDS/EBS without encryption-at-rest. (`iac:unencrypted-storage`, CIS AWS 2.3, SOC 2 CC6.7.)
- **Open security groups** — SGs with `0.0.0.0/0` ingress on non-HTTP ports (SSH/DB/RDP). (`iac:open-sg`, CIS AWS 4.1-4.3.)
- **Missing logging/monitoring** — no CloudTrail, no VPC flow logs, no guardduty. (`iac:missing-logging`, CIS AWS 3.x, SOC 2 CC7.2.)
- **Secrets in IaC** — hardcoded keys/tokens in Terraform variables, CloudFormation parameters. (CWE-798, `iac:hardcoded-secret`.)
- **Missing network isolation** — no VPC, public subnets for private services, no NACLs. (`iac:no-isolation`.)

### Platform config is infrastructure too

Many of our repos have no Terraform. Their infrastructure is `vercel.json`, `next.config.*` (headers, rewrites, redirects), `middleware.ts`/`proxy.ts` matchers, `supabase/config.toml` and migration policies, and `wrangler.toml`. Scanners do not read these, so judge them by reasoning. Recall:

```bash
rg --files -g 'vercel.json' -g 'next.config.*' -g 'middleware.ts' -g 'proxy.ts' -g '**/supabase/config.toml' -g 'wrangler.toml' -g 'wrangler.json*'
rg -n -g 'vercel.json' -e '"crons"' -e '"headers"' -e '"rewrites"'
rg -n -t ts -e 'export const config\s*=\s*\{' -e 'matcher' -e "runtime\s*=\s*['\"]edge"
rg -n -t ts -e 'CRON_SECRET' -e 'x-vercel-' -e 'x-forwarded-' -e 'cf-connecting-ip'
```

Core discipline: a manifest is not proof of a live exposure. Say which environment uses it and what overrides it. Secret references are not disclosure; you need a lower-trust reader. Account-level settings (Vercel deployment protection, Supabase network restrictions, Cloudflare zone rules) are outside the repo: when they decide the finding, use `confidence: "needs-owner-input"`.

- **Event-source identity**: a Vercel cron or other platform-invoked route that anyone can call because it never checks the caller (`CRON_SECRET` bearer, a platform header the edge strips from client requests). Queue and webhook consumers (QStash, Stripe, Twilio) belong to `messaging`. (CWE-306, `iac:event-source-identity`.)
- **Trusted-proxy headers**: forwarded and client-IP headers that decide identity, redirects, host, tenant, or an IP allow rule are `web-auth:forwarded-header-trust`; file them there. This lens keeps only the platform side: a config that adds or forwards such a header without overwriting the client's value. (CWE-348, `iac:trusted-proxy-header`.)
- **Control precedence drift**: a middleware `matcher` that skips paths the app assumes are covered (`/api`, `_next/data`, route groups), security headers set in two places that disagree, or a rewrite that reaches a route around its gate. (`iac:precedence-drift`.)
- **Edge/runtime mismatch**: a check that runs on the edge runtime while the handler it protects also runs on another runtime or path, or a server-only secret (service-role key) referenced from code that ships to the edge. A secret shipped to the browser is `client-side:client-exposure`. (`iac:runtime-boundary`.)
- **Workload identity overreach**: a function or worker holds an admin credential (Supabase service role, Cloudflare API token with account scope) where a narrower one would do, and request input picks the target. (CWE-250, `iac:workload-overreach`.)
- **Unsafe credential fallback**: a missing env var falls back to a default secret, an open mode, or an anonymous client instead of failing closed. (CWE-1188, `iac:insecure-fallback`.)
- **Object and signed-URL policy**: bucket or storage policy grants broader access than the app's own checks. File the tenant-lifecycle angle under `data-isolation`.

Platform classes adapted from Cloudflare's security-audit skill (MIT); see the plugin's `NOTICE.md`.

## Compose with the repo's own rules

Load the repo's IaC/cloud rules from `CLAUDE.md` / `AGENTS.md`. Prefer the repo's rule on conflict. Treat documented/accepted exceptions (e.g. "staging bucket is intentionally public") as non-findings. Return a ruleCheck for every rule handed.
