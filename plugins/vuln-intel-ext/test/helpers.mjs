// Shared test helpers: an isolated SQLite file, a recording fetch mock, and a fake MCP server
// that captures tool handlers so tests drive the real registered tools.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must run before any module calls getDb().
process.env.VULN_INTEL_DB_PATH = join(mkdtempSync(join(tmpdir(), "vuln-intel-test-")), "test.db");

export function json(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// routes: async (url, init) => Response. Records every call in `calls`.
export function mockFetch(route) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return route(call);
  };
  return calls;
}

export async function loadTools() {
  const { registerTools } = await import("../dist/tools.js");
  const handlers = {};
  registerTools({
    tool: (...args) => {
      handlers[args[0]] = args[args.length - 1];
    },
  });
  return handlers;
}

export function parse(result) {
  return JSON.parse(result.content[0].text);
}
