// Usage: node make.mjs
// Writes a fixture app into ./src: clean files that must pass, and one file per rule violation.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
rmSync(join(root, "src"), { recursive: true, force: true });

const SB = `import { createClient } from "@supabase/supabase-js";`;
const ADMIN = `import { admin } from "@/server/admin/client";`;
const SYSTEM = `import { makeSystemContext } from "@/server/system-context";`;

const files = {
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] }, module: "esnext", moduleResolution: "bundler", jsx: "preserve" } }),
  // Clean. Every file below must trip nothing.
  "src/shared/types/ids.ts": `export type ItemId = string & { readonly brand: "ItemId" };`,
  "src/modules/items/domain/value.ts": `export const v = 1;`,
  "src/modules/items/domain/item.ts": `import { v } from "./value";\nimport type { ItemId } from "@/shared/types/ids";\nexport const item = v;\nexport type Id = ItemId;`,
  "src/modules/items/application/dto.ts": `import { item } from "../domain/item";\nimport type { ItemStatus } from "@/shared/types/db-enums";\nexport const dto = item;\nexport type ItemDTO = { id: string; status: ItemStatus };`,
  "src/modules/items/application/schemas.ts": `export const ItemSchema = { name: "string" };`,
  "src/modules/items/application/use-cases/create-item.ts": `import { dto } from "../dto";\nexport const createItem = dto;\nexport type CreateItemInput = { name: string };`,
  "src/shared/types/db-enums.ts": `import type { Database } from "@/server/db/database.types";\nexport type ItemStatus = keyof Database;`,
  "src/modules/items/infrastructure/supabase-item.repository.ts": `${SB}\nimport type { Database } from "@/server/db/database.types";\nimport { item } from "../domain/item";\nexport const repo = [createClient, item];\nexport type Db = Database;`,
  "src/modules/items/ui/item-form.tsx": `export const ItemForm = () => null;`,
  "src/modules/items/index.ts": `export { createItem } from "./application/use-cases/create-item";`,
  "src/modules/items/client.ts": `export { ItemForm } from "./ui/item-form";\nexport { ItemSchema } from "./application/schemas";\nexport type { ItemDTO } from "./application/dto";\nexport type { CreateItemInput } from "./application/use-cases/create-item";`,
  "src/app/items/page.tsx": `import { createItem } from "@/modules/items";\nexport default createItem;`,
  "src/app/items/client-panel.tsx": `"use client";\nimport { ItemForm } from "@/modules/items/client";\nexport default ItemForm;`,
  "src/server/db/database.types.ts": `export type Database = { public: {} };`,
  "src/server/admin/client.ts": `${SB}\nexport const admin = createClient;`,
  "src/server/supabase/server.ts": `${SB}\nexport const createServerSupabaseClient = createClient;`,
  "src/server/supabase/proxy.ts": `${SB}\nexport const updateSession = createClient;`,
  "src/proxy.ts": `import { updateSession } from "@/server/supabase/proxy";\nexport const proxy = updateSession;`,
  "src/shared/lib/supabase/browser.ts": `${SB}\nimport type { Database } from "@/server/db/database.types";\nexport const browserClient = createClient;\nexport type Db = Database;`,
  "src/server/admin/auth-admin.ts": `${SB}\nexport const authAdmin = createClient;`,
  "src/server/admin-context.ts": `import { authAdmin } from "./admin/auth-admin";\nexport const makeAdminContext = () => authAdmin;`,
  "src/app/settings/actions.ts": `"use server";\nimport { makeAdminContext } from "@/server/admin-context";\nexport const invite = makeAdminContext;`,
  "src/server/run-as-system.ts": `import { makeSystemContext } from "./system-context";\nexport const runAsSystem = () => makeSystemContext();`,
  "src/server/helpers.ts": `export { makeSystemContext } from "./system-context";`,
  "src/server/run-as-admin.ts": `import { admin } from "./admin/client";\nexport const runAsAdmin = admin;`,
  "src/server/context.ts": `import { createServerSupabaseClient } from "./supabase/server";\nimport { repo } from "@/modules/items/infrastructure/supabase-item.repository";\nexport const makeRequestContext = () => [createServerSupabaseClient, repo];`,
  "src/server/system-context.ts": `import { admin } from "./admin/client";\nimport { repo } from "@/modules/items/infrastructure/supabase-item.repository";\nexport const makeSystemContext = () => [admin, repo];`,
  "src/app/api/cron/cleanup/route.ts": `${SYSTEM}\nexport const GET = makeSystemContext;`,
  "src/app/api/webhooks/stripe/route.ts": `${SYSTEM}\nexport const POST = makeSystemContext;`,
  "src/features/notes/data.ts": `import type { SupabaseClient } from "@supabase/supabase-js";\nimport { createServerSupabaseClient } from "@/server/supabase/server";\nexport const notes = createServerSupabaseClient;\nexport type C = SupabaseClient;`,
  "src/modules/billing/application/use-cases/charge-ok.ts": `import { createItem } from "@/modules/items";\nexport const ok = createItem;`,
  "src/modules/billing/infrastructure/stripe.gateway.ts": `export const gateway = 1;`,
  // Violations. check.mjs lists the rules each one must trip.
  "src/modules/items/domain/bad-reach.ts": `import { dto } from "../application/dto";\nexport const x = dto;`,
  "src/modules/items/domain/bad-supabase.ts": `${SB}\nexport const x = createClient;`,
  "src/modules/items/application/use-cases/bad-infra.ts": `import { repo } from "../../infrastructure/supabase-item.repository";\nexport const x = repo;`,
  "src/app/items/bad-deep.ts": `import { dto } from "@/modules/items/application/dto";\nexport const x = dto;`,
  "src/app/items/bad-deep-ui.tsx": `import { ItemForm } from "@/modules/items/ui/item-form";\nexport default ItemForm;`,
  "src/app/items/bad-infra.ts": `import { repo } from "@/modules/items/infrastructure/supabase-item.repository";\nexport const x = repo;`,
  "src/app/items/bad-supabase.ts": `${SB}\nexport const x = createClient;`,
  "src/app/projects/[id]/page.tsx": `import { createServerSupabaseClient } from "@/server/supabase/server";\nexport default createServerSupabaseClient;`,
  "src/app/items/bad-db-types.ts": `import type { Database } from "@/server/db/database.types";\nexport type X = Database;`,
  "src/modules/billing/application/use-cases/bad-cross.ts": `import { dto } from "@/modules/items/application/dto";\nexport const x = dto;`,
  "src/modules/billing/index.ts": `export { gateway } from "./infrastructure/stripe.gateway";`,
  "src/modules/billing/client.ts": `export { ok } from "./application/use-cases/charge-ok";`,
  "src/shared/lib/bad-admin.ts": `${ADMIN}\nexport const x = admin;`,
  "src/modules/items/infrastructure/bad-admin.ts": `${ADMIN}\nexport const x = admin;`,
  "src/app/items/bad-page-admin.tsx": `${ADMIN}\nexport default admin;`,
  "src/app/api/items/route.ts": `${ADMIN}\nexport const POST = admin;`,
  "src/app/api/webhooks/bad/route.ts": `${ADMIN}\nexport const POST = admin;`,
  "src/app/items/bad-page-system.tsx": `${SYSTEM}\nexport default makeSystemContext;`,
  "src/app/items/actions.ts": `"use server";\n${SYSTEM}\nexport const act = makeSystemContext;`,
  "src/app/admin/wrapper-actions.ts": `"use server";\nimport { runAsSystem } from "@/server/run-as-system";\nexport const a = runAsSystem;`,
  "src/app/admin/reexport-actions.ts": `"use server";\nimport { makeSystemContext } from "@/server/helpers";\nexport const b = makeSystemContext;`,
  "src/app/admin/direct-actions.ts": `"use server";\nimport { runAsAdmin } from "@/server/run-as-admin";\nexport const c = runAsAdmin;`,
  "src/app/settings/bad-page-admin-ctx.tsx": `import { makeAdminContext } from "@/server/admin-context";\nexport default makeAdminContext;`,
  "src/shared/lib/cycle-a.ts": `import { b } from "./cycle-b";\nexport const a = () => b;`,
  "src/shared/lib/cycle-b.ts": `import { a } from "./cycle-a";\nexport const b = () => a;`,
};

for (const [p, body] of Object.entries(files)) {
  const full = join(root, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body + "\n");
}
