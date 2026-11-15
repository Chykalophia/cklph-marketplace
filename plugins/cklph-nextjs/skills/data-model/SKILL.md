---
name: data-model
description: The Supabase-generated types file is the source of truth for schema. Use when touching any repository, query, insert, or update against the database, before adding/changing a column or table, or any time "is column X required?" comes up.
---

# data-model — read the generated types first

Supabase generates the canonical TypeScript map. Don't re-derive it. Don't trust your memory of the
schema. **Read the generated file before touching anything DB-shaped.**

## The canonical artifact
`src/server/db/database.types.ts` — produced by:

```bash
supabase gen types typescript --linked > src/server/db/database.types.ts
```

Legacy repos on `lib/` keep it at `lib/types/database.ts`; same rules, old path.

Regenerate **after every migration** and commit the regenerated file **in the same commit as the
migration**, so reviewers see schema + types together. (Codified in `discipline`.)

## How to read it
- `Database['public']['Tables']['<name>']['Row']` — what comes back from `SELECT`.
- `Database['public']['Tables']['<name>']['Insert']` — what's required on `INSERT`. TypeScript marks
  **NOT NULL** columns as **required**; columns with `DEFAULT` or NULLABLE as **optional**. Forget a
  required column → TS yells **before** runtime.
- `Database['public']['Tables']['<name>']['Update']` — all optional (partial update).
- `Database['public']['Enums']['<name>']` — the enum literal union. Use this, never a raw string.
- `Database['public']['Functions']['<name>']` — RPC return types.

Use these row types **only in `infrastructure/` repositories** (and `src/server/`) — never hand-roll a
`{ name: string; … }` for a row that already has a generated type. The repository maps the row to a
domain type or DTO; use cases and UI only ever see those. That way a schema change stops at the
repository mapper instead of rippling through every component that rendered the row.

## Rules
- **Never query without the generated types loaded** — if you can't see the row shape, you'll guess
  the columns wrong (a recurring source of bugs).
- **When adding a column** — write the migration → regen types → update the repository mapper, then
  the DTO if the client needs the field. In that order.
- **When dropping / renaming** — same order. The regen guarantees compile errors at every old usage
  point; use them as the find-and-replace map.
- **RLS implications** — a query that compiles can still fail at runtime if RLS denies the user.
  Always test with a real user session, not just service-role bypass.

## Anti-patterns
- **Memorizing the schema** and writing types by hand — they drift; the generated file doesn't.
- **`as Row` casts** when TypeScript complains — usually means the migration is committed but types
  weren't regenerated. **Regenerate; don't cast.**
- **Editing `src/server/db/database.types.ts` by hand** — it's regenerated. Your edits get blown away.
- **Importing `Database['public']['Tables'][…]['Row']` into a component, action or use case** — the
  schema now leaks into the UI. Return a DTO from the repository instead.

Pair with **`supabase-migrations`** (the CLI workflow that produces schema changes), **`architecture`**
(the layered structure that consumes these types), and **`api-routes`** (where use-case DTOs
flow into route handlers).
