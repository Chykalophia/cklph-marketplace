import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { json, mockFetch, loadTools, parse } from "./helpers.mjs";

const db = await import("../dist/db.js");
const tools = await loadTools();

const SINCE = "2026-01-01T00:00:00Z";
const PKG = { name: "lodash", version: "4.17.15", ecosystem: "npm" };

// Shapes recorded from api.osv.dev: querybatch returns only {id, modified} per vuln;
// /v1/vulns/<id> returns the full record.
function record(id, fields) {
  return {
    id,
    summary: `summary of ${id}`,
    aliases: [],
    withdrawn: null,
    database_specific: { severity: "HIGH" },
    ...fields,
  };
}

function osvRoute(batchResults, records) {
  return (call) => {
    if (call.url.endsWith("/v1/querybatch")) return batchResults(call);
    const id = decodeURIComponent(call.url.split("/v1/vulns/")[1]);
    const r = records[id];
    if (typeof r === "number") return json(r, { code: 5, message: "error" });
    return r ? json(200, r) : json(404, { code: 5, message: "Bug not found." });
  };
}

function scanCount() {
  return db.getDb().prepare("SELECT COUNT(*) AS n FROM scan_history").get().n;
}

beforeEach(() => {
  db.getDb().exec("DELETE FROM scan_history");
});

test("an advisory published after `since` is reported as NEW (dates come from the full record)", async () => {
  mockFetch(
    osvRoute(
      () => json(200, { results: [{ vulns: [{ id: "GHSA-new", modified: "2026-03-01T00:00:00Z" }] }] }),
      { "GHSA-new": record("GHSA-new", { published: "2026-02-01T00:00:00Z", modified: "2026-03-01T00:00:00Z" }) },
    ),
  );
  const out = parse(await tools.diff_since({ since: SINCE, packages: [PKG] }));
  assert.deepEqual(out.newVulnerabilities.map((v) => v.id), ["GHSA-new"]);
  assert.equal(out.modifiedVulnerabilities.length, 0);
  assert.equal(out.summary.newCount, 1);
});

test("an advisory withdrawn after `since` is reported as WITHDRAWN", async () => {
  mockFetch(
    osvRoute(
      () => json(200, { results: [{ vulns: [{ id: "GHSA-gone", modified: "2026-04-01T00:00:00Z" }] }] }),
      {
        "GHSA-gone": record("GHSA-gone", {
          published: "2025-01-01T00:00:00Z",
          modified: "2026-04-01T00:00:00Z",
          withdrawn: "2026-04-01T00:00:00Z",
        }),
      },
    ),
  );
  const out = parse(await tools.diff_since({ since: SINCE, packages: [PKG] }));
  assert.deepEqual(out.withdrawnAdvisories, ["GHSA-gone"]);
  assert.equal(out.modifiedVulnerabilities.length, 0);
});

test("control: an old advisory updated after `since` is MODIFIED, not NEW", async () => {
  mockFetch(
    osvRoute(
      () => json(200, { results: [{ vulns: [{ id: "GHSA-old", modified: "2026-04-01T00:00:00Z" }] }] }),
      { "GHSA-old": record("GHSA-old", { published: "2022-01-01T00:00:00Z", modified: "2026-04-01T00:00:00Z" }) },
    ),
  );
  const out = parse(await tools.diff_since({ since: SINCE, packages: [PKG] }));
  assert.equal(out.newVulnerabilities.length, 0);
  assert.deepEqual(out.modifiedVulnerabilities.map((v) => v.id), ["GHSA-old"]);
});

test("an OSV HTTP error is an error, not a clean scan, and no scan record is saved", async () => {
  mockFetch(() => json(503, { code: 14, message: "unavailable" }));
  const res = await tools.diff_since({ since: SINCE, packages: [PKG] });
  assert.equal(res.isError, true);
  const out = parse(res);
  assert.equal(out.failedPackages.length, 1);
  assert.match(out.failedPackages[0].error, /503/);
  assert.equal(scanCount(), 0);
});

test("a querybatch body without results is an error, not a clean scan", async () => {
  mockFetch(() => json(200, {}));
  const res = await tools.diff_since({ since: SINCE, packages: [PKG] });
  assert.equal(res.isError, true);
  assert.equal(scanCount(), 0);
});

test("the batch request carries a timeout signal", async () => {
  const calls = mockFetch(osvRoute(() => json(200, { results: [{}] }), {}));
  const res = await tools.diff_since({ since: SINCE, packages: [PKG] });
  assert.notEqual(res.isError, true);
  const batch = calls.find((c) => c.url.endsWith("/v1/querybatch"));
  assert.ok(batch.init.signal instanceof AbortSignal, "querybatch fetch has no AbortSignal");
});

test("a failed advisory-record fetch is an error, not a silent MODIFIED/clean", async () => {
  mockFetch(
    osvRoute(
      () => json(200, { results: [{ vulns: [{ id: "GHSA-x", modified: "2026-03-01T00:00:00Z" }] }] }),
      { "GHSA-x": 500 },
    ),
  );
  const res = await tools.diff_since({ since: SINCE, packages: [PKG] });
  assert.equal(res.isError, true);
  assert.deepEqual(parse(res).failedAdvisories.map((f) => f.id), ["GHSA-x"]);
  assert.equal(scanCount(), 0);
});

test("paginated batch results (next_page_token) are followed, not truncated", async () => {
  mockFetch(
    osvRoute(
      (call) =>
        call.body.queries[0].page_token === "p2"
          ? json(200, { results: [{ vulns: [{ id: "GHSA-p2", modified: "2026-03-01T00:00:00Z" }] }] })
          : json(200, {
              results: [{ vulns: [{ id: "GHSA-p1", modified: "2026-03-01T00:00:00Z" }], next_page_token: "p2" }],
            }),
      {
        "GHSA-p1": record("GHSA-p1", { published: "2026-02-01T00:00:00Z", modified: "2026-03-01T00:00:00Z" }),
        "GHSA-p2": record("GHSA-p2", { published: "2026-02-01T00:00:00Z", modified: "2026-03-01T00:00:00Z" }),
      },
    ),
  );
  const out = parse(await tools.diff_since({ since: SINCE, packages: [PKG] }));
  assert.deepEqual(out.newVulnerabilities.map((v) => v.id).sort(), ["GHSA-p1", "GHSA-p2"]);
});

test("unrated (UNKNOWN) advisories survive a severity filter; LOW ones are filtered", async () => {
  mockFetch(
    osvRoute(
      () =>
        json(200, {
          results: [
            {
              vulns: [
                { id: "GHSA-unrated", modified: "2026-03-01T00:00:00Z" },
                { id: "GHSA-low", modified: "2026-03-01T00:00:00Z" },
              ],
            },
          ],
        }),
      {
        "GHSA-unrated": record("GHSA-unrated", {
          published: "2026-02-01T00:00:00Z",
          modified: "2026-03-01T00:00:00Z",
          database_specific: {},
          severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N" }],
        }),
        "GHSA-low": record("GHSA-low", {
          published: "2026-02-01T00:00:00Z",
          modified: "2026-03-01T00:00:00Z",
          database_specific: { severity: "LOW" },
        }),
      },
    ),
  );
  const out = parse(await tools.diff_since({ since: SINCE, packages: [PKG], severity: "high" }));
  assert.deepEqual(out.newVulnerabilities.map((v) => [v.id, v.severity]), [["GHSA-unrated", "UNKNOWN"]]);
  assert.equal(out.summary.unknownSeverityCount, 1);
});
