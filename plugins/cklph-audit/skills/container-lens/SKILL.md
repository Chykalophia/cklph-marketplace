---
name: container-lens
description: The container/OCI lens — vulnerable base images, secrets baked into layers, privileged containers, root users, missing healthchecks, unpinned images. Wraps Trivy-image/Grype/dive/hadolint for recall; the reviewer judges runtime reachability. Loaded by audit-reviewer when auditing through the container lens.
---

# container-lens — container image judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline.

1. **Deterministic tool → recall.** Run `"${CLAUDE_PLUGIN_ROOT}/tools/container.sh" <root> [image]` — wraps Trivy image scan, Grype, dive (layer inspection), hadolint (Dockerfile linting). Emits JSON lines: `{ tool, rule, severity, image, layer, package, cve, rationale }`. The image scan runs only for an image you name: find this repo's own tag (compose `image:`, a Makefile or CI `docker build -t`) and pass it if that image exists locally (`docker image inspect <tag>`). Never pick one from `docker images`; an unrelated image's CVEs are not this repo's. With no image, only the Dockerfiles are linted: say so in coverage.
2. **You (reviewer LLM) → judgment.** Strip base-image noise (Alpine has hundreds of CVEs, most not reachable), judge real exposure, check for secrets in layers, privileged/root misconfig.
3. **Verifier → precision.** A separate `audit-verifier` refutes every finding.

Gated by `fixtures/container/should-flag` / `should-not-flag`; recall ≥ 0.8, precision ≥ 0.7 after verify.

## Checklist (the judgment layer)

Map every finding to a `container:*` rule id and CIS Docker Benchmark where applicable.

- **Base image vulnerabilities** — is the vulnerable library actually loaded at runtime? Strip distro noise (e.g. busybox utils never called). Judge by reachability. (`container:vuln-baseimage`.)
- **Root user** — `USER root` or no USER directive (defaults to root). (CIS Docker 4.1, `container:root-user`.)
- **Privileged container** — `privileged: true` grants host access. (`container:privileged`, HIGH.)
- **Secrets in layers** — `.env` files, API keys, tokens copied into the image. Even if removed in a later layer, they persist in earlier layers. (`container:secret-layer`, CRITICAL.)
- **Unpinned base images** — `FROM node:latest` instead of `FROM node:22-slim@sha256:...`. Latest tags drift and can introduce vulns. (`container:unpinned-base`.)
- **Missing healthcheck** — no `HEALTHCHECK` directive; orchestrators can't detect zombie containers. (`container:no-healthcheck`, LOW.)
- **No resource limits** — no `--memory` / `--cpus` limits; a single container can DoS the host. (`container:no-limits`, LOW.)
- **Sensitive mounts** — Docker socket mounted (`/var/run/docker.sock`), host filesystem mounted. (`container:sensitive-mount`, HIGH.)

## Compose with the repo's own rules

Load the repo's container rules from `CLAUDE.md` / `AGENTS.md`. Prefer the repo's rule on conflict. Return a ruleCheck for every rule handed.
