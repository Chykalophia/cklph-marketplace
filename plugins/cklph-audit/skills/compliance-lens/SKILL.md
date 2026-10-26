---
name: compliance-lens
description: The compliance lens — maps findings from all other lenses to formal security frameworks (SOC 2 Trust Services Criteria, CASA/Cloud Application Security Assessment). Produces a compliance coverage matrix where every control is accounted for. Reuses the rule-closure matrix mechanism with a framework rulebook instead of repo rules. Opt-in HIPAA technical-safeguard rulebook. Loaded by audit-reviewer when auditing through the compliance lens.
---

# compliance-lens — compliance cross-mapping over aggregated findings

You are the **judgment layer** that maps findings from all other lenses to formal compliance frameworks. Unlike other lenses, you don't hunt for new vulnerabilities — you **map existing findings to controls** and identify **control gaps** (controls with no evidence either way).

## TOOL

- **No deterministic scanner** — compliance is a mapping exercise, not a scan. Your input is the **aggregated findings from all other lenses** (security, sca, iac, container, k8s, supply-chain, agent-config, correctness, architecture) plus the repo's own rules.
- Load the applicable **rulebook** from `${CLAUDE_PLUGIN_ROOT}/skills/compliance-lens/rulebooks/<framework>.yaml` — these are the discrete controls you map against.

## Frameworks supported

- **SOC 2** (Trust Services Criteria): CC1-CC9 (Common Criteria), A1 (Availability), C1 (Confidentiality), P1 (Processing Integrity).
- **CASA** (Cloud Application Security Assessment, Google Play): data classification, security requirements per tier, vulnerability management, penetration testing, data storage/destruction.
- **HIPAA** (opt-in, `compliance: { frameworks: [hipaa] }`): the code-reviewable technical safeguards in `rulebooks/hipaa.yaml` (PHI classification, row-level access, tamper-evident audit trail, leak vectors, vendor/BAA boundary). Administrative and physical safeguards, risk analysis, and BAA paperwork are owner evidence: they are listed as `hipaa:ADM1`, `hipaa:ADM2`, `hipaa:PHY1` and `hipaa:BA1` so the matrix names them, and they stay `not-checked` (code or docs never mark them `met`). Attribution in `rulebooks/NOTICE-hipaa.md`.

## Checklist (the mapping layer)

For each control in the rulebook:

1. **Is there a finding that violates this control?** → `violation` (link the finding ID). Example: SOC 2 CC6.1 (logical access controls) → if the security lens found a missing authz check, that's a violation.
2. **Is there evidence the control is met?** → `met` (cite the guard/pattern). Example: SOC 2 CC6.1 → if IaC lens verified RLS policies are in place, that's evidence the control is met.
3. **Is this control not applicable?** → `not-applicable` (one-line reason). Example: SOC 2 A1 (availability) → if the app has no uptime SLA requirements, not-applicable.
4. **No evidence either way?** → `not-checked` (honest — this is a GAP that needs manual review). This is the most important output — it tells the owner exactly which compliance controls have no automated evidence.

## Mapping table (CWE/ASVS → SOC 2 / CASA)

Use this to map findings to controls:

| Finding rule | SOC 2 control | CASA requirement |
|---|---|---|
| `CWE-862` (missing authz) | CC6.1, CC6.3 | Access control |
| `CWE-89` (SQLi) | CC6.1, CC7.1 | Input validation |
| `CWE-798` (hardcoded secrets) | CC6.1, CC6.7 | Credential management |
| `sca:direct-cve` | CC7.1, CC7.2 | Vulnerability management |
| `iac:public-resource` | CC6.6, CC6.7 | Infrastructure security |
| `container:privileged` | CC6.6 | Container security |
| `k8s:rbac-overprivilege` | CC6.3, CC6.6 | Access control |
| `supplychain:pull-request-target` | CC8.1 | Change management |
| `omission:missing-validation` | CC6.1 | Input validation |
| `agentcfg:mcp-unpinned`, `agentcfg:hook-remote-fetch` | CC8.1 | Change management |
| `agentcfg:perm-bypass`, `agentcfg:runtime-unvalidated-action` | CC6.1, CC6.8 | Access control |
| Correctness: fail-open | CC7.4 | Incident response |

## PHI leak vectors (when `hipaa` is selected)

Most HIPAA violations in code are leaks, not missing features. Map these finding shapes to the `hipaa:LV*` controls even when the originating lens filed them under a generic rule (a security-lens "PII in logs" finding is `hipaa:LV1` evidence when the field is PHI):

- **Logs and monitoring** (`hipaa:LV1`): whole patient objects logged, PHI in `console.*`/logger calls, error-tracking events carrying request bodies. Opaque record IDs only.
- **Error messages** (`hipaa:LV2`): a thrown or returned error string interpolating a name, DOB, or MRN that reaches the client.
- **URLs** (`hipaa:LV3`): identifiers or search terms in path segments or query strings.
- **Analytics** (`hipaa:LV4`): events, session replay, or pixels capturing form fields or page titles that contain PHI.
- **Browser storage** (`hipaa:LV5`): PHI in `localStorage`, `sessionStorage`, IndexedDB, or a persisted client cache.
- **LLM prompts** (`hipaa:LV6`): PHI sent to a model, embedding, or agent context without a BAA-covered provider and minimization (cross-check `agentcfg:runtime-secret-exposure`).

When a PHI table lacks row-level access control or an insert-only audit trail, that is `hipaa:AC2` / `hipaa:AU2` evidence; pair with the cklph-nextjs `supabase-migrations` RLS template for the fix.

## Output discipline

Return `{ complianceMatrix: [{ framework, control, status, findingIds?, evidence?, reason? }] }` — one entry per control per framework. `status` ∈ `met` | `violation` | `not-applicable` | `not-checked`. This feeds the synthesizer's `## Compliance matrix` section.

**No control is silently absent.** An honest `not-checked` is a feature — it tells the owner exactly where they need manual evidence for attestation.
