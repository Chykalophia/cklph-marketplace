/**
 * dependency-cruiser config for the cklph feature-module layout (see ../SKILL.md).
 *
 * Usage, locally and in CI:
 *   cp <this file> .dependency-cruiser.cjs
 *   npx -p dependency-cruiser@18.7.2 -p typescript@6 depcruise src --config .dependency-cruiser.cjs
 *
 * Run it exactly like that, with both packages pinned on the command line.
 * dependency-cruiser 18 needs TypeScript below 7 to parse .ts files. With TypeScript 7
 * (the native port, now what `npm i typescript` installs) or none, it scans 0 modules
 * and exits 0, so every rule passes silently. Pinning typescript@6 in the app only
 * holds until the next dependency bump; the -p pair does not depend on the app's
 * compiler. Bare `npx depcruise` in a repo without dependency-cruiser installed
 * fetches an unrelated placeholder package. The summary line must report more than
 * 0 modules cruised.
 *
 * Paths assume the module layout under src/. On a legacy lib/ repo, point the rule
 * paths at the old folders, record a baseline (depcruise-baseline), and fail CI only
 * on new violations.
 */

const MODULE = "^src/modules/([^/]+)/";
// A module has two public entries: index.ts (server: use cases, DTO types) and
// client.ts (client-safe: components, hooks, DTO types).
const MODULE_ENTRY = "^src/modules/[^/]+/(index|client)\\.(ts|tsx)$";
const INFRASTRUCTURE = "^src/modules/[^/]+/infrastructure/";
const LITE_DAL = "^src/features/[^/]+/data\\.ts$";
const SYSTEM_ROUTES = "^src/app/api/(webhooks|cron|jobs)/";
// actions.ts anywhere under src/app/, files in an actions/ folder, or *.actions.ts.
const ACTIONS = [
  "^src/app/actions\\.ts$", "^src/app/.+/actions\\.ts$", "^src/app/actions/[^/]+\\.ts$", "^src/app/.+/actions/[^/]+\\.ts$", "^src/app/.+\\.actions\\.ts$",
];
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
        "domain/ is framework-free: no next, no @supabase, nothing outside its own domain/ " +
        "except shared branded types in src/shared/types/. " +
        "To allow a pure library such as zod, add it to to.pathNot.",
      from: { path: `${MODULE}domain/` },
      to: { pathNot: ["^src/modules/$1/domain/", "^src/shared/types/"] },
    },
    {
      name: "application-not-to-infrastructure",
      severity: "error",
      comment: "Use cases get implementations through ctx, built in src/server/context.ts.",
      from: { path: "^src/modules/[^/]+/application/" },
      to: { path: INFRASTRUCTURE },
    },
    {
      name: "app-not-to-infrastructure-or-supabase",
      severity: "error",
      comment: "Layer skipping. A route or page that queries directly skips the use case's ownership policy.",
      from: { path: "^src/app/" },
      to: { path: [INFRASTRUCTURE, SUPABASE] },
    },
    {
      name: "server-supabase-client-only-in-server",
      severity: "error",
      comment:
        "Layer skipping through the user-scoped client in src/server/supabase/. Only src/server/, " +
        "repositories, the Lite data.ts, and middleware/proxy (session refresh) may import it.",
      from: {
        path: "^src/",
        pathNot: ["^src/server/", INFRASTRUCTURE, LITE_DAL, "^src/(middleware|proxy)\\.ts$"],
      },
      to: { path: "^src/server/supabase/" },
    },
    {
      name: "no-deep-module-imports",
      severity: "error",
      comment:
        "Code outside src/modules/ reaches a module only through its index.ts or client.ts. " +
        "src/server/ is exempt: the composition root wires repositories to ports, so it imports infrastructure/.",
      from: { path: "^src/", pathNot: ["^src/modules/", "^src/server/"] },
      to: { path: "^src/modules/[^/]+/.+", pathNot: MODULE_ENTRY },
    },
    {
      name: "no-deep-module-imports-across-modules",
      severity: "error",
      comment: "One module reaches another only through that module's index.ts or client.ts.",
      from: { path: MODULE },
      to: {
        path: "^src/modules/[^/]+/.+",
        pathNot: [`^src/modules/$1/`, MODULE_ENTRY],
      },
    },
    {
      name: "module-entry-not-to-infrastructure",
      severity: "error",
      comment: "A module's public entries never re-export repositories or gateways.",
      from: { path: MODULE_ENTRY },
      to: { path: INFRASTRUCTURE },
    },
    {
      name: "client-entry-server-free",
      severity: "error",
      comment:
        "client.ts is imported by client components. application/ files carry import 'server-only', " +
        "so a value re-export breaks next build. Re-export DTO types with export type (erased); " +
        "application/schemas.ts is the one client-shared file. next build still catches a " +
        "server-only file reached through ui/, which this rule does not follow.",
      from: { path: "^src/modules/([^/]+)/client\\.(ts|tsx)$" },
      to: {
        path: "^src/modules/$1/application/",
        pathNot: "^src/modules/$1/application/schemas\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "supabase-only-in-infra",
      severity: "error",
      comment:
        "Only repositories, src/server/, the Lite data.ts, and the browser client in " +
        "src/shared/lib/supabase/ talk to Supabase.",
      from: {
        path: "^src/",
        pathNot: [INFRASTRUCTURE, "^src/server/", LITE_DAL, "^src/shared/lib/supabase/"],
      },
      to: { path: SUPABASE },
    },
    {
      name: "db-types-only-in-infra",
      severity: "error",
      comment:
        "Generated row types stay in repositories and src/server/. Everything else gets DTOs. " +
        "The typed browser client and src/shared/types/db-enums.ts (enum unions) are the exceptions.",
      from: {
        path: "^src/",
        pathNot: [INFRASTRUCTURE, "^src/server/", LITE_DAL, "^src/shared/lib/supabase/", "^src/shared/types/db-enums\\.ts$"],
      },
      to: { path: "^src/server/db/" },
    },
    {
      name: "admin-client-isolated",
      severity: "error",
      comment:
        "The service-role client bypasses RLS. Only src/server/ imports src/server/admin/. " +
        "Ban the secret key itself outside src/server/admin/ with a lint rule; imports cannot see it.",
      from: { path: "^src/", pathNot: "^src/server/" },
      to: { path: "^src/server/admin/" },
    },
    {
      name: "admin-client-sealed",
      severity: "error",
      comment:
        "Inside src/server/, only system-context.ts holds the full service-role client, so no " +
        "helper can pass it further. This seal replaces following import chains, which would " +
        "also flag every page that imports a server action.",
      from: { path: "^src/server/", pathNot: ["^src/server/admin/", "^src/server/system-context\\.ts$"] },
      to: { path: "^src/server/admin/", pathNot: "^src/server/admin/auth-admin\\.ts$" },
    },
    {
      name: "auth-admin-sealed",
      severity: "error",
      comment: "Only admin-context.ts uses auth-admin.ts, the auth admin API without table access.",
      from: { path: "^src/server/", pathNot: ["^src/server/admin/", "^src/server/admin-context\\.ts$"] },
      to: { path: "^src/server/admin/auth-admin\\.ts$" },
    },
    {
      name: "auth-admin-own-client",
      severity: "error",
      comment:
        "auth-admin.ts builds its own client and returns only client.auth.admin behind fixed methods, " +
        "so it never touches the full client. What a gateway returns is beyond import rules: review it.",
      from: { path: "^src/server/admin/auth-admin\\.ts$" },
      to: { path: "^src/server/admin/", pathNot: "^src/server/admin/auth-admin\\.ts$" },
    },
    {
      name: "system-context-only-in-system-routes",
      severity: "error",
      comment:
        "makeSystemContext() gives full service-role table access. Only webhook, cron and job " +
        "routes import it; nothing in src/server/ re-exports or wraps it.",
      from: { path: "^src/", pathNot: SYSTEM_ROUTES },
      to: { path: "^src/server/system-context\\.ts$" },
    },
    {
      name: "admin-context-only-in-actions",
      severity: "error",
      comment:
        "makeAdminContext() exposes fixed auth admin calls (invite, delete, ban) and requires a " +
        "getUser() identity. Only server action files import it; nothing in src/server/ wraps it. " +
        "The exemption goes by file name, so the factory itself takes the verified actor and every " +
        "gateway method re-checks the admin policy: a leaked import is useless without one.",
      from: { path: "^src/", pathNot: ACTIONS },
      to: { path: "^src/server/admin-context\\.ts$" },
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
