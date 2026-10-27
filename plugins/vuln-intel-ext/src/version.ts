import { readFileSync } from "fs";

// plugin.json is the single owner of the version; the MCP server reports what it says.
// dist/version.js and src/version.ts both sit one level below the plugin root.
export function serverVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    if (typeof manifest.version === "string" && manifest.version) return manifest.version;
  } catch {
    // fall through: a missing manifest must not stop the server
  }
  return "0.0.0-unknown";
}
