/**
 * dependency-cruiser config for the cklph feature-module layout (see ../SKILL.md).
 *
 * Usage:
 *   npm i -D dependency-cruiser typescript@6
 *   cp <this file> .dependency-cruiser.cjs
 *   npx depcruise src --config .dependency-cruiser.cjs
 *
 * TypeScript must be installed in the app, below version 7. Without it, or with
 * TypeScript 7 (the native port, which dependency-cruiser 18 cannot load),
 * dependency-cruiser cannot parse .ts files, scans 0 modules and exits 0, so
 * every rule passes silently. `npm i typescript` installs 7, so pin it.
 * `npx depcruise --info` must show a check next to .ts, and the run must report
 * more than 0 modules cruised.
 *
 * Paths assume the app keeps its code under src/. On a legacy lib/ repo, run it
 * with these rules as a baseline instead (depcruise-baseline), and fail CI only
 * on new violations.
 */

const MODULE = "^src/modules/([^/]+)/";
const MODULE_INDEX = "^src/modules/[^/]+/index\\.(ts|tsx)$";
const SUPABASE = "(^|node_modules/)@supabase/";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Cycles hide which layer owns a rule and break tree-shaking.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-not-to-outside",
      severity: "error",
      comment:
        "domain/ is framework-free: no next, no @supabase, nothing outside its own domain/. " +
        "To allow a pure library such as zod, add it to to.pathNot.",
      from: { path: `${MODULE}domain/` },
      to: { pathNot: "^src/modules/$1/domain/" },
    },
    {
      name: "application-not-to-infrastructure",
      severity: "error",
      comment: "Use cases get implementations through ctx, built in src/server/context.ts.",
      from: { path: "^src/modules/[^/]+/application/" },
      to: { path: "^src/modules/[^/]+/infrastructure/" },
    },
    {
      name: "app-not-to-infrastructure-or-supabase",
      severity: "error",
      comment: "Layer skipping. A route or page that queries directly skips the use case's ownership policy.",
      from: { path: "^src/app/" },
      to: { path: ["^src/modules/[^/]+/infrastructure/", SUPABASE] },
    },
    {
      name: "no-deep-module-imports",
      severity: "error",
      comment:
        "Code outside src/modules/ reaches a module only through its index.ts. " +
        "src/server/ is exempt: the composition root wires repositories to ports, so it imports infrastructure/.",
      from: { path: "^src/", pathNot: ["^src/modules/", "^src/server/"] },
      to: { path: "^src/modules/[^/]+/.+", pathNot: MODULE_INDEX },
    },
    {
      name: "no-deep-module-imports-across-modules",
      severity: "error",
      comment: "One module reaches another only through that module's index.ts.",
      from: { path: MODULE },
      to: {
        path: "^src/modules/[^/]+/.+",
        pathNot: [`^src/modules/$1/`, MODULE_INDEX],
      },
    },
    {
      name: "supabase-only-in-infra",
      severity: "error",
      comment: "Only repositories and src/server/ talk to Supabase.",
      from: {
        path: "^src/",
        pathNot: ["^src/modules/[^/]+/infrastructure/", "^src/server/"],
      },
      to: { path: SUPABASE },
    },
    {
      name: "admin-client-isolated",
      severity: "error",
      comment:
        "The service-role client bypasses RLS. Only src/server/ (the composition root) and " +
        "route handlers for webhooks and cron may import src/server/admin/. " +
        "Ban the secret key itself outside src/server/admin/ with a lint rule; imports cannot see it.",
      from: {
        path: "^src/",
        pathNot: ["^src/server/", "^src/app/route\\.(ts|js)$", "^src/app/.*/route\\.(ts|js)$"],
      },
      to: { path: "^src/server/admin/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
