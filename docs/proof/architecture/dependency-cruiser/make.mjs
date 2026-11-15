// Usage: node make.mjs
// Writes a fixture app into ./src: clean files that must pass, and one file per rule violation.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
rmSync(join(root, "src"), { recursive: true, force: true });

const files = {
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] }, module: "esnext", moduleResolution: "bundler", jsx: "preserve" } }),
  // Clean: the composition root and a cron route may import infrastructure/ and the admin client.
  "src/modules/items/domain/value.ts": `export const v = 1;`,
  "src/modules/items/domain/item.ts": `import { v } from "./value";\nexport const item = v;`,
  "src/modules/items/application/dto.ts": `import { item } from "../domain/item";\nexport const dto = item;`,
  "src/modules/items/application/use-cases/create-item.ts": `import { dto } from "../dto";\nexport const createItem = dto;`,
  "src/modules/items/infrastructure/supabase-item.repository.ts": `import { createClient } from "@supabase/supabase-js";\nimport { item } from "../domain/item";\nexport const repo = [createClient, item];`,
  "src/modules/items/index.ts": `export { createItem } from "./application/use-cases/create-item";`,
  "src/app/items/page.tsx": `import { createItem } from "@/modules/items";\nexport default createItem;`,
  "src/server/admin/client.ts": `import { createClient } from "@supabase/supabase-js";\nexport const admin = createClient;`,
  "src/server/context.ts": `import { admin } from "./admin/client";\nimport { repo } from "@/modules/items/infrastructure/supabase-item.repository";\nexport const ctx = [admin, repo];`,
  "src/app/api/cron/route.ts": `import { admin } from "@/server/admin/client";\nexport const GET = admin;`,
  "src/modules/billing/application/use-cases/charge-ok.ts": `import { createItem } from "@/modules/items";\nexport const ok = createItem;`,
  // Violations. check.mjs lists the rules each one must trip.
  "src/modules/items/domain/bad-reach.ts": `import { dto } from "../application/dto";\nexport const x = dto;`,
  "src/modules/items/domain/bad-supabase.ts": `import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;`,
  "src/modules/items/application/use-cases/bad-infra.ts": `import { repo } from "../../infrastructure/supabase-item.repository";\nexport const x = repo;`,
  "src/app/items/bad-deep.ts": `import { dto } from "@/modules/items/application/dto";\nexport const x = dto;`,
  "src/app/items/bad-infra.ts": `import { repo } from "@/modules/items/infrastructure/supabase-item.repository";\nexport const x = repo;`,
  "src/app/items/bad-supabase.ts": `import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;`,
  "src/modules/billing/application/use-cases/bad-cross.ts": `import { dto } from "@/modules/items/application/dto";\nexport const x = dto;`,
  "src/shared/lib/bad-admin.ts": `import { admin } from "@/server/admin/client";\nexport const x = admin;`,
  "src/modules/items/infrastructure/bad-admin.ts": `import { admin } from "@/server/admin/client";\nexport const x = admin;`,
  "src/app/items/bad-page-admin.tsx": `import { admin } from "@/server/admin/client";\nexport default admin;`,
  "src/shared/lib/cycle-a.ts": `import { b } from "./cycle-b";\nexport const a = () => b;`,
  "src/shared/lib/cycle-b.ts": `import { a } from "./cycle-a";\nexport const b = () => a;`,
};

for (const [p, body] of Object.entries(files)) {
  const full = join(root, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body + "\n");
}
