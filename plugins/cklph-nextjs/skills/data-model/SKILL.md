---
name: data-model
description: The Supabase-generated types file is the source of truth for schema. Use when touching any service, repository, query, insert, or update against the database, before adding/changing a column or table, or any time "is column X required?" comes up.
---

# data-model — read the generated types first

Supabase generates the canonical TypeScript map. Don't re-derive it. Don't trust your memory of the
schema. **Read the generated file before touching anything DB-shaped.**

## The canonical artifact
`lib/types/database.ts` — produced by:

```bash
supabase gen types typescript --linked > lib/types/database.ts
```

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

Use these types **in your service signatures** — never hand-roll a `{ name: string; … }` for a row
that already has a generated type.

## Rules
- **Never query without the generated types loaded** — if you can't see the row shape, you'll guess
  the columns wrong (a recurring source of bugs).
- **When adding a column** — write the migration → regen types → update the service. In that order.
- **When dropping / renaming** — same order. The regen guarantees compile errors at every old usage
  point; use them as the find-and-replace map.
- **RLS implications** — a query that compiles can still fail at runtime if RLS denies the user.
  Always test with a real user session, not just service-role bypass.

## Anti-patterns
- **Memorizing the schema** and writing types by hand — they drift; the generated file doesn't.
- **`as Row` casts** when TypeScript complains — usually means the migration is committed but types
  weren't regenerated. **Regenerate; don't cast.**
- **Editing `lib/types/database.ts` by hand** — it's regenerated. Your edits get blown away.

Pair with **`supabase-migrations`** (the CLI workflow that produces schema changes), **`architecture`**
(the layered structure that consumes these types), and **`api-routes`** (where service signatures
flow into route handlers).
