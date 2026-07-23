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

## Compose with the repo's own rules

Load the repo's IaC/cloud rules from `CLAUDE.md` / `AGENTS.md`. Prefer the repo's rule on conflict. Treat documented/accepted exceptions (e.g. "staging bucket is intentionally public") as non-findings. Return a ruleCheck for every rule handed.
