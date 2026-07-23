---
name: sca-lens
description: The software-composition-analysis lens — known CVEs in direct + transitive dependencies, abandoned/malicious packages, license risk, SBOM generation. Wraps Trivy/Grype/Syft/OSV-Scanner for recall; the reviewer judges reachability. Loaded by audit-reviewer when auditing a unit through the SCA lens.
---

# sca-lens — dependency vulnerability judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. Do not hunt by reading lockfiles alone, and do not present guesses as facts. The pipeline is:

1. **Deterministic tool → recall.** Run the lens tool first; it enumerates vulnerable packages exhaustively. You reason over its output instead of trying to find every dep by eye.
2. **You (reviewer LLM) → judgment.** Decide which CVEs are real risks here (is the vulnerable function actually called?), the upgrade path, transitive depth, and whether a dep is abandoned/malicious.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding you emit (default-to-refuted). Recall comes from the tool, never from the verifier.

This lens is **gated by the fixture precision/recall test** (`fixtures/sca/should-flag` for recall, `should-not-flag` for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify). It does not ship degraded.

## TOOL

- **Run `${CLAUDE_PLUGIN_ROOT}/tools/sca.sh`** on the unit's globs (or the repo root for a dep-wide pass). This is your recall pass — it wraps Trivy, Grype, Syft, and OSV-Scanner and emits JSON lines: `{ tool, rule, severity, package, version, fixedVersion, cve, rationale }`.
- The tool is near-exhaustive for known CVEs; your job is **reachability judgment** — is the vulnerable function actually called in this codebase? A CVE in a dep that's never imported is low; the same CVE in a hot-path import is critical.
- For **abandoned/malicious/typosquat** detection: review the Syft SBOM output for packages with no recent updates, suspicious names (typosquats of popular packages), or packages from unverified publishers.

## Checklist (the judgment layer)

Judge each candidate against these. Map every finding to a **CWE** and/or **CVE** id.

- **Known CVEs (direct deps)** — is the vulnerable version pinned? Is the vulnerable function/method called in the codebase? Is there a fixed version available? (CWE-* per CVE, `sca:direct-cve`.)
- **Known CVEs (transitive deps)** — trace the transitive chain; is the vulnerable transitive dep actually loaded? Can it be deduped/overridden? (`sca:transitive`.)
- **Abandoned packages** — no commits/releases in 12+ months, no maintainer response to issues. Risk = unpatched vulns accumulate. (`sca:abandoned`.)
- **Malicious/typosquat** — package name that closely resembles a popular package but is from a different publisher. (`sca:malicious-pkg`.)
- **License risk** — GPL/AGPL in a commercial project, or incompatible licenses. (`sca:license`. LOW severity unless it blocks a release.)
- **Reachability** — the most important judgment: a CVE in `lodash@4.17.20` where `merge` is called is critical; the same CVE where only `deburr` is called (not the vulnerable function) is low. Trace the actual imports and usage.

## Compose with the repo's own rules

Before judging, **load the repo's dependency rules**: `CLAUDE.md` / `AGENTS.md` for pinned-version policies, allowed licenses, or package allowlists. These encode project-specific musts.

- **On conflict, prefer the repo's rule** over the generic lens.
- Treat **documented/accepted exceptions** (in the baseline or repo learnings) as **non-findings**.
- When you flag something the repo's own rule already names, cite that rule id alongside the CVE.
- **Rulebook compliance:** return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe`/`not-applicable` need a one-line citation/reason.
