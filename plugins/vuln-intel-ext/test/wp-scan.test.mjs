import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { json, mockFetch, loadTools, parse } from "./helpers.mjs";

process.env.WPSCAN_TOKEN = "test-token";
const db = await import("../dist/db.js");
const tools = await loadTools();

// WPScan v3 shapes (documented API): bodies are keyed by plugin/theme slug, or by the dotted
// WordPress version for core; `vulnerabilities` is an array; `cvss` is {score, vector, severity}.
function vuln(title, extra = {}) {
  return {
    id: title.toLowerCase().replace(/\W+/g, "-"),
    title,
    created_at: "2026-01-01T00:00:00.000Z",
    fixed_in: "3.2.1",
    references: { url: ["https://example.test/advisory"], cve: ["2026-0001"] },
    cvss: { score: "6.1", vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", severity: "medium" },
    ...extra,
  };
}

beforeEach(() => {
  db.getDb().exec("DELETE FROM wpscan_cache");
});

test("plugin vulnerabilities are read from the slug-keyed body", async () => {
  mockFetch(() =>
    json(200, {
      "contact-form-7": {
        friendly_name: "Contact Form 7",
        latest_version: "6.0",
        vulnerabilities: [vuln("Reflected XSS"), vuln("CSRF")],
      },
    }),
  );
  const out = parse(await tools.wp_scan({ type: "plugin", name: "contact-form-7" }));
  assert.equal(out.count, 2);
  assert.deepEqual(out.vulnerabilities.map((v) => v.title), ["Reflected XSS", "CSRF"]);
  assert.equal(out.vulnerabilities[0].cvss, 6.1);
});

test("core lookups request /wordpresses/<version without dots> and read the version key", async () => {
  const calls = mockFetch((call) =>
    call.url.endsWith("/wordpresses/561")
      ? json(200, { "5.6.1": { release_date: "2021-02-03", status: "insecure", vulnerabilities: [vuln("Core SQLi")] } })
      : json(404, { status: "error" }),
  );
  const out = parse(await tools.wp_scan({ type: "core", name: "wordpress", version: "5.6.1" }));
  assert.equal(out.count, 1);
  assert.equal(calls[0].url, "https://wpscan.com/api/v3/wordpresses/561");
  assert.ok(calls[0].init.signal instanceof AbortSignal, "WPScan fetch has no AbortSignal");
});

test("a core lookup without a version is an error, not a clean result", async () => {
  mockFetch(() => json(404, { status: "error" }));
  const res = await tools.wp_scan({ type: "core", name: "wordpress" });
  assert.equal(res.isError, true);
});

test("a 404 is an error and is not cached as clean", async () => {
  const calls = mockFetch(() => json(404, { status: "plugin not found" }));
  const first = await tools.wp_scan({ type: "plugin", name: "no-such-plugin" });
  assert.equal(first.isError, true);
  const second = await tools.wp_scan({ type: "plugin", name: "no-such-plugin" });
  assert.equal(second.isError, true);
  assert.equal(calls.length, 2, "second call was served from a cached negative result");
});

test("an unparsed body is an error and is not cached", async () => {
  const calls = mockFetch(() => json(200, { unexpected: "shape" }));
  assert.equal((await tools.wp_scan({ type: "theme", name: "twentytwentyfour" })).isError, true);
  assert.equal((await tools.wp_scan({ type: "theme", name: "twentytwentyfour" })).isError, true);
  assert.equal(calls.length, 2);
});

test("re-caching an unversioned lookup replaces the row instead of adding one", () => {
  db.setWPScanCache("plugin", "akismet", undefined, { format: 2, vulnerabilities: [] });
  db.setWPScanCache("plugin", "akismet", undefined, { format: 2, vulnerabilities: [vuln("New")] });
  const n = db.getDb().prepare("SELECT COUNT(*) AS n FROM wpscan_cache WHERE name = 'akismet'").get().n;
  assert.equal(n, 1);
  assert.equal(db.getWPScanCache("plugin", "akismet").data.vulnerabilities.length, 1);
});

test("a successful result is cached; a pre-1.0.3 cached empty list is ignored", async () => {
  // What older versions wrote after a 404 or an unparsed body.
  db.setWPScanCache("plugin", "elementor", undefined, []);
  const calls = mockFetch(() => json(200, { elementor: { vulnerabilities: [vuln("Stored XSS")] } }));
  const first = parse(await tools.wp_scan({ type: "plugin", name: "elementor" }));
  assert.equal(first.count, 1);
  assert.equal(first.cached, false);
  const second = parse(await tools.wp_scan({ type: "plugin", name: "elementor" }));
  assert.equal(second.count, 1);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
});
