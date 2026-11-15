// Usage: node check.mjs (after node make.mjs)
// Runs the shipped dependency-cruiser reference over the fixture and asserts each file trips
// exactly its expected rules, clean files trip none, and more than 0 modules were cruised.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const config = fileURLToPath(new URL("../../../../plugins/cklph-nextjs/skills/architecture/references/dependency-cruiser.cjs", import.meta.url));

// depcruise exits non-zero whenever it finds violations, which the fixture always has.
const run = spawnSync("npx", ["depcruise", "src", "--config", config, "--output-type", "json"], { cwd: here, encoding: "utf8" });
if (!run.stdout) {
  console.log(run.stderr);
  process.exit(1);
}
const out = JSON.parse(run.stdout);

const got = {};
for (const v of out.summary.violations) {
  const key = v.rule.name === "no-circular" ? "cycle" : v.from;
  (got[key] ??= new Set()).add(v.rule.name);
}

const expected = {
  "src/modules/items/domain/bad-reach.ts": ["domain-not-to-outside"],
  "src/modules/items/domain/bad-supabase.ts": ["domain-not-to-outside", "supabase-only-in-infra"],
  "src/modules/items/application/use-cases/bad-infra.ts": ["application-not-to-infrastructure"],
  "src/app/items/bad-deep.ts": ["no-deep-module-imports"],
  "src/app/items/bad-infra.ts": ["app-not-to-infrastructure-or-supabase", "no-deep-module-imports"],
  "src/app/items/bad-supabase.ts": ["app-not-to-infrastructure-or-supabase", "supabase-only-in-infra"],
  "src/modules/billing/application/use-cases/bad-cross.ts": ["no-deep-module-imports-across-modules"],
  "src/shared/lib/bad-admin.ts": ["admin-client-isolated"],
  "src/modules/items/infrastructure/bad-admin.ts": ["admin-client-isolated"],
  "src/app/items/bad-page-admin.tsx": ["admin-client-isolated"],
  cycle: ["no-circular"],
};

let fail = 0;
if (out.summary.totalCruised === 0) {
  fail++;
  console.log("FAIL 0 modules cruised: TypeScript is missing or 7+ (see the config header)");
}
for (const [k, rules] of Object.entries(expected)) {
  const g = [...(got[k] ?? [])].sort().join(",");
  const e = [...rules].sort().join(",");
  if (g !== e) {
    fail++;
    console.log(`FAIL ${k}\n  expected ${e}\n  got      ${g || "(nothing)"}`);
  }
}
for (const k of Object.keys(got)) {
  if (!(k in expected)) {
    fail++;
    console.log(`FAIL clean file tripped ${[...got[k]].join(",")}: ${k}`);
  }
}
console.log(`modules cruised: ${out.summary.totalCruised}; violations: ${out.summary.violations.length}; ${fail ? `${fail} failures` : "every rule fires only where it should"}`);
process.exit(fail ? 1 : 0);
