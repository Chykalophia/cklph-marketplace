---
name: simplify
description: Simplify code for clarity without changing behavior. Use after a feature works but reads harder than it should, or when review flags needless complexity. Behavior-preserving refactor only.
---

# simplify — clarity without behavior change

Ask: *would a new teammate understand this faster after the change?*

- Remove dead code, needless abstractions, and premature generality (three similar lines beat a wrong abstraction).
- Flatten deep nesting (early returns); name things for **intent**; delete redundant/obvious comments.
- Collapse duplication only when it's genuinely the same concept (rule of three).

**Preserve behavior** — tests must stay green; this is a refactor, not a rewrite. If a change alters
behavior, it's out of scope — stop and flag it.
