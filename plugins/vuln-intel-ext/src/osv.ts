import type { PackageRef } from "./db.js";

export interface OsvVuln {
  id: string;
  summary?: string;
  published?: string;
  modified?: string;
  withdrawn?: string | null;
  aliases?: string[];
  severity?: Array<{ type: string; score: string }>;
  database_specific?: Record<string, unknown>;
}

export interface OsvBatchResult {
  package: PackageRef;
  vulns: OsvVuln[];
  error?: string;
}

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
const BATCH_SIZE = 1000;

export async function queryBatch(
  packages: PackageRef[],
): Promise<OsvBatchResult[]> {
  const results: OsvBatchResult[] = [];

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const chunk = packages.slice(i, i + BATCH_SIZE);
    const queries = chunk.map((p) => ({
      package: {
        name: p.name,
        ecosystem: p.ecosystem,
      },
      version: p.version,
    }));

    const resp = await fetch(OSV_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      for (const p of chunk) {
        results.push({ package: p, vulns: [], error: `OSV API ${resp.status}: ${errText}` });
      }
      continue;
    }

    const body = (await resp.json()) as { results: Array<{ vulns?: OsvVuln[] }> };

    for (let j = 0; j < chunk.length; j++) {
      const pkgResult = body.results?.[j];
      results.push({
        package: chunk[j],
        vulns: pkgResult?.vulns ?? [],
      });
    }
  }

  return results;
}

export async function querySingle(pkg: PackageRef): Promise<OsvVuln[]> {
  const resp = await fetch(OSV_QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      package: { name: pkg.name, ecosystem: pkg.ecosystem },
      version: pkg.version,
    }),
  });

  if (!resp.ok) return [];
  const body = (await resp.json()) as { vulns?: OsvVuln[] };
  return body.vulns ?? [];
}

const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";

export async function getVulnDetails(id: string): Promise<OsvVuln | null> {
  const resp = await fetch(`${OSV_VULN_URL}/${id}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as OsvVuln;
}

export async function enrichVulns(
  vulns: OsvVuln[],
): Promise<OsvVuln[]> {
  const ids = [...new Set(vulns.map((v) => v.id))];
  if (ids.length === 0) return vulns;

  const details = await Promise.allSettled(
    ids.map((id) => getVulnDetails(id)),
  );

  const detailMap = new Map<string, OsvVuln>();
  for (const result of details) {
    if (result.status === "fulfilled" && result.value) {
      detailMap.set(result.value.id, result.value);
    }
  }

  return vulns.map((v) => detailMap.get(v.id) ?? v);
}

export function deriveSeverityLabel(vuln: OsvVuln): string {
  const dbSeverity = vuln.database_specific?.severity as string | undefined;
  if (dbSeverity) {
    const upper = dbSeverity.toUpperCase();
    if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  }

  if (vuln.severity && vuln.severity.length > 0) {
    for (const s of vuln.severity) {
      const scoreStr = s.score;
      const match = scoreStr.match(/CVSS:3\.[01]\/[^\s]*AV:[^\s]*/);
      if (match) {
        return cvssToLabel(scoreStr);
      }
    }
  }

  return "UNKNOWN";
}

function cvssToLabel(vector: string): string {
  const match = vector.match(/CVSS:3\.[01]\/AV:[A-Z]/);
  if (!match) return "UNKNOWN";

  let score = 0;
  if (vector.includes("C:H")) score += 6;
  else if (vector.includes("C:L")) score += 2.2;
  if (vector.includes("I:H")) score += 2;
  else if (vector.includes("I:L")) score += 0.7;
  if (vector.includes("A:H")) score += 2;
  else if (vector.includes("A:L")) score += 0.7;

  if (vector.includes("AV:N")) score += 0.85;
  if (vector.includes("PR:N")) score += 0.85;

  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

const SEVERITY_ORDER = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function severityRank(label: string): number {
  const idx = SEVERITY_ORDER.indexOf(label.toUpperCase());
  return idx === -1 ? 0 : idx;
}

export function worstSeverity(labels: string[]): string {
  let worst = "UNKNOWN";
  let worstRank = 0;
  for (const l of labels) {
    const r = severityRank(l);
    if (r > worstRank) {
      worstRank = r;
      worst = l;
    }
  }
  return worst;
}
