---
name: api-design
description: Design a clean interface or contract. Use for the "Slice 0" contract task before parallel build waves that share an API surface, or when defining a new module, route, or type boundary.
---

# api-design — define the contract first

- **Small surface** — expose the minimum; deep module behind a narrow interface.
- **Accept dependencies, return results** — pass collaborators in; return data rather than reaching out.
- **Types are the contract** — define request / response / error types up front; make illegal states
  unrepresentable; validate external input at the boundary (e.g. Zod).
- **Stable & explicit** — name for the consumer; no surprising side effects; deprecate deliberately.

**Output:** the contract (types / signatures) that parallel slices build against — land it as Slice 0.
