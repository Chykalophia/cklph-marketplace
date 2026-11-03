<!-- -->
# Security policy

## Reporting a vulnerability

Please report security issues privately through our advisory form:
[Report a vulnerability](https://example.com/acme/security/advisories/new).
Don't open a public issue or pull request for a security problem.

Include what you found, how to reproduce it, and what an attacker could do with it.
We aim to acknowledge reports within 3 business days and to agree on a fix and a
disclosure date with you before anything is published.

## Supported versions

Acme has no versioned releases yet. Fixes land on `main`; self-hosters should update
to the latest `main`.

## Scope

In scope: the Acme application and its build and deploy files in this repository
(`Containerfile`, `deploy/`, `compose.yml`, `hosting.json`).

Out of scope: vulnerabilities in a hosting provider, database or email service you
run Acme on, and findings that only work for an attacker who is already an Acme
admin. A way to become an admin, or to act as one, is in scope.
