# Spec template (full)

Lazy-loaded depth for the `spec` phase. The SKILL.md captures the essentials; use this structure when a
spec needs the full treatment.

## 1. Problem
What we're solving, why now, and who it's for.

## 2. Scope
Explicitly **in** scope / **out** of scope.

## 3. Requirements
The behavior that must exist.

## 4. Acceptance criteria
Testable "done" statements. **Reframe fuzzy asks into measurable targets** ("faster" → "LCP < 2.5s on 4G").

## 5. Boundaries (the autonomy envelope)
- **Always do:** safe, pre-approved actions the build flow may take without asking.
- **Ask first:** schema/DB changes, new dependencies, destructive ops, anything externally visible (push/PR/deploy).
- **Never do:** hard limits.

## 6. Commands
The exact, executable commands to build / test / verify this — so later phases don't guess.

> Watch for scope-creep rationalizations ("it's basically the same", "while I'm here", "it'll only take a
> sec"). Note the new idea; don't build it.
