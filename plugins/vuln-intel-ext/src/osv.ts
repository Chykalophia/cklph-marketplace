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

// A result with `error` set means the lookup FAILED for that package. Its empty `vulns` is not
// "no vulnerabilities" and must never be reported or recorded as a clean result.
export interface OsvBatchResult {
  package: PackageRef;
  vulns: OsvVuln[];
  error?: string;
}

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
const BATCH_SIZE = 1000;
const BATCH_TIMEOUT_MS = 30000;
const DETAIL_TIMEOUT_MS = 10000;
const DETAIL_CONCURRENCY = 10;
// OSV pages a query result (next_page_token) when a package has very many advisories.
const MAX_PAGES = 20;

interface BatchQuery {
  package: { name: string; ecosystem?: string };
  version: string;
  page_token?: string;
}

interface BatchResponse {
  results?: Array<{ vulns?: OsvVuln[]; next_page_token?: string }>;
}

async function postBatch(queries: BatchQuery[]): Promise<NonNullable<BatchResponse["results"]>> {
  const resp = await fetch(OSV_BATCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries }),
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`OSV API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  }
  const body = (await resp.json()) as BatchResponse;
  if (!Array.isArray(body?.results) || body.results.length !== queries.length) {
    throw new Error(
      `OSV API returned an unexpected response (expected ${queries.length} results, got ${
        Array.isArray(body?.results) ? body.results.length : "none"
      })`,
    );
  }
  return body.results;
}

export async function queryBatch(
  packages: PackageRef[],
): Promise<OsvBatchResult[]> {
  const results: OsvBatchResult[] = [];

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const chunk = packages.slice(i, i + BATCH_SIZE);
    const chunkResults: OsvBatchResult[] = chunk.map((p) => ({ package: p, vulns: [] }));
    let pending: Array<{ idx: number; token?: string }> = chunk.map((_, idx) => ({ idx }));

    try {
      for (let page = 0; pending.length > 0; page++) {
        if (page >= MAX_PAGES) {
          throw new Error(`OSV results still paginated after ${MAX_PAGES} pages; result is incomplete`);
        }
        const queries = pending.map(({ idx, token }) => ({
          package: { name: chunk[idx].name, ecosystem: chunk[idx].ecosystem },
          version: chunk[idx].version,
          ...(token ? { page_token: token } : {}),
        }));
        const pageResults = await postBatch(queries);
        const next: Array<{ idx: number; token?: string }> = [];
        pageResults.forEach((r, j) => {
          const idx = pending[j].idx;
          chunkResults[idx].vulns.push(...(r?.vulns ?? []));
          if (r?.next_page_token) next.push({ idx, token: r.next_page_token });
        });
        pending = next;
      }
    } catch (e) {
      const message = (e as Error).message;
      for (const r of chunkResults) {
        r.vulns = [];
        r.error = message;
      }
    }

    results.push(...chunkResults);
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
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
  });

  // A failed query is an error, never an empty (clean) result.
  if (!resp.ok) throw new Error(`OSV API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  const body = (await resp.json()) as { vulns?: OsvVuln[] };
  return body.vulns ?? [];
}

export async function getVulnDetails(id: string): Promise<OsvVuln> {
  const resp = await fetch(`${OSV_VULN_URL}/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`OSV API ${resp.status} for ${id}`);
  const body = (await resp.json()) as OsvVuln;
  if (!body || body.id !== id) throw new Error(`OSV API returned an unexpected record for ${id}`);
  return body;
}

export interface EnrichResult {
  details: Map<string, OsvVuln>;
  failed: Array<{ id: string; error: string }>;
}

// querybatch returns only {id, modified}; the full record (published, withdrawn, severity,
// aliases) comes from /v1/vulns/<id>. Failures are returned, not swallowed.
export async function enrichVulns(vulns: OsvVuln[]): Promise<EnrichResult> {
  const ids = [...new Set(vulns.map((v) => v.id))];
  const details = new Map<string, OsvVuln>();
  const failed: Array<{ id: string; error: string }> = [];

  let next = 0;
  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        details.set(id, await getVulnDetails(id));
      } catch (e) {
        failed.push({ id, error: (e as Error).message });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, () => worker()),
  );

  return { details, failed };
}

const DB_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MEDIUM", // GitHub advisories use MODERATE
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

// Returns UNKNOWN when there is no usable rating (no database label, no CVSS v3 vector, e.g.
// CVSS v4 only). UNKNOWN means "not rated", not "low"; callers must not filter it out.
export function deriveSeverityLabel(vuln: OsvVuln): string {
  const dbSeverity = vuln.database_specific?.severity;
  if (typeof dbSeverity === "string") {
    const label = DB_SEVERITY_LABELS[dbSeverity.toUpperCase()];
    if (label) return label;
  }

  for (const s of vuln.severity ?? []) {
    const score = cvss3BaseScore(s.score);
    if (score !== null) return cvssScoreToLabel(score);
  }

  return "UNKNOWN";
}

// CVSS v3.0/v3.1 base score, per the FIRST specification (section 7 formulas).
const CVSS3_WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

function roundUp(value: number): number {
  const int = Math.round(value * 100000);
  if (int % 10000 === 0) return int / 100000;
  return (Math.floor(int / 10000) + 1) / 10;
}

export function cvss3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m: Record<string, string> = {};
  for (const part of vector.split("/").slice(1)) {
    const [k, v] = part.split(":");
    if (k && v) m[k] = v;
  }
  const av = CVSS3_WEIGHTS.AV[m.AV as keyof typeof CVSS3_WEIGHTS.AV];
  const ac = CVSS3_WEIGHTS.AC[m.AC as keyof typeof CVSS3_WEIGHTS.AC];
  const ui = CVSS3_WEIGHTS.UI[m.UI as keyof typeof CVSS3_WEIGHTS.UI];
  const c = CVSS3_WEIGHTS.CIA[m.C as keyof typeof CVSS3_WEIGHTS.CIA];
  const i = CVSS3_WEIGHTS.CIA[m.I as keyof typeof CVSS3_WEIGHTS.CIA];
  const a = CVSS3_WEIGHTS.CIA[m.A as keyof typeof CVSS3_WEIGHTS.CIA];
  const scope = m.S;
  if ([av, ac, ui, c, i, a].some((x) => x === undefined) || (scope !== "U" && scope !== "C")) {
    return null;
  }
  const changed = scope === "C";
  const prWeights = changed ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };
  const pr = prWeights[m.PR as keyof typeof prWeights];
  if (pr === undefined) return null;

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  return changed
    ? roundUp(Math.min(1.08 * (impact + exploitability), 10))
    : roundUp(Math.min(impact + exploitability, 10));
}

function cvssScoreToLabel(score: number): string {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
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
