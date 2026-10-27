import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const osv = await import("../dist/osv.js");

const label = (fields) => osv.deriveSeverityLabel({ id: "X", ...fields });
const cvss = (score) => label({ severity: [{ type: "CVSS_V3", score }] });

test("GitHub's MODERATE rating maps to MEDIUM", () => {
  assert.equal(label({ database_specific: { severity: "MODERATE" } }), "MEDIUM");
});

test("CVSS v3 vectors are labelled from the real base score", () => {
  // Expected scores from the FIRST CVSS v3.1 calculator.
  assert.equal(cvss("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"), "MEDIUM"); // 5.3
  assert.equal(cvss("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"), "MEDIUM"); // 6.1
  assert.equal(cvss("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"), "CRITICAL"); // 9.8
  assert.equal(cvss("CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N"), "MEDIUM"); // 5.5
  // 3.7: "AC:H" must not be read as "C:H" (the old substring approximation said HIGH).
  assert.equal(cvss("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L"), "LOW");
});

test("cvss3BaseScore matches the specification's numbers", () => {
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"), 5.3);
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"), 6.1);
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"), 9.8);
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"), 10);
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N"), 1.6);
  assert.equal(osv.cvss3BaseScore("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L"), 3.7);
});

test("control: CVSS v4 only or no rating is UNKNOWN", () => {
  assert.equal(cvss("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"), "UNKNOWN");
  assert.equal(label({}), "UNKNOWN");
});

test("the MCP server reports plugin.json's version, and package.json agrees", async () => {
  const { serverVersion } = await import("../dist/version.js");
  const plugin = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(serverVersion(), plugin.version);
  assert.equal(pkg.version, plugin.version);
});
