const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
const BATCH_SIZE = 1000;
const BATCH_TIMEOUT_MS = 30000;
const DETAIL_TIMEOUT_MS = 10000;
const DETAIL_CONCURRENCY = 10;
// OSV pages a query result (next_page_token) when a package has very many advisories.
const MAX_PAGES = 20;
function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isTimestamp(v) {
    return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
// Parsing boundary for one querybatch / query result. Anything off-shape throws: an empty
// `vulns` must only ever come from an explicit "no vulnerabilities" answer.
function parseQueryResult(r) {
    if (!isPlainObject(r))
        throw new Error("OSV API returned an unexpected result (not an object)");
    const { vulns, next_page_token } = r;
    if (vulns !== undefined && vulns !== null && !Array.isArray(vulns)) {
        throw new Error("OSV API returned an unexpected result ('vulns' is not a list)");
    }
    for (const v of vulns ?? []) {
        if (!isPlainObject(v) || typeof v.id !== "string" || v.id === "") {
            throw new Error("OSV API returned an unexpected result (advisory without an id)");
        }
    }
    if (next_page_token !== undefined && next_page_token !== null && typeof next_page_token !== "string") {
        throw new Error("OSV API returned an unexpected result ('next_page_token' is not a string)");
    }
    return {
        vulns: (vulns ?? []),
        ...(next_page_token ? { next_page_token } : {}),
    };
}
async function postBatch(queries) {
    const resp = await fetch(OSV_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
        signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
        throw new Error(`OSV API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    }
    const body = (await resp.json());
    if (!Array.isArray(body?.results) || body.results.length !== queries.length) {
        throw new Error(`OSV API returned an unexpected response (expected ${queries.length} results, got ${Array.isArray(body?.results) ? body.results.length : "none"})`);
    }
    return body.results.map(parseQueryResult);
}
export async function queryBatch(packages) {
    const results = [];
    for (let i = 0; i < packages.length; i += BATCH_SIZE) {
        const chunk = packages.slice(i, i + BATCH_SIZE);
        const chunkResults = chunk.map((p) => ({ package: p, vulns: [] }));
        let pending = chunk.map((_, idx) => ({ idx }));
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
                const next = [];
                pageResults.forEach((r, j) => {
                    const idx = pending[j].idx;
                    chunkResults[idx].vulns.push(...r.vulns);
                    if (r.next_page_token)
                        next.push({ idx, token: r.next_page_token });
                });
                pending = next;
            }
        }
        catch (e) {
            const message = e.message;
            for (const r of chunkResults) {
                r.vulns = [];
                r.error = message;
            }
        }
        results.push(...chunkResults);
    }
    return results;
}
export async function querySingle(pkg) {
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
    if (!resp.ok)
        throw new Error(`OSV API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    return parseQueryResult(await resp.json()).vulns;
}
export async function getVulnDetails(id) {
    const resp = await fetch(`${OSV_VULN_URL}/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    if (!resp.ok)
        throw new Error(`OSV API ${resp.status} for ${id}`);
    return parseVulnRecord(await resp.json(), id);
}
// Parsing boundary for a full /v1/vulns/<id> record. diff_since classifies an advisory from
// these dates and ratings, so a record it cannot read is a failed fetch, never "no change".
export function parseVulnRecord(body, id) {
    const bad = (why) => new Error(`OSV API returned an unexpected record for ${id} (${why})`);
    if (!isPlainObject(body))
        throw bad("not an object");
    if (body.id !== id)
        throw bad("id mismatch");
    if (!isTimestamp(body.modified))
        throw bad("missing or invalid 'modified'");
    if (body.published !== undefined && body.published !== null && !isTimestamp(body.published)) {
        throw bad("invalid 'published'");
    }
    if (body.withdrawn !== undefined && body.withdrawn !== null && !isTimestamp(body.withdrawn)) {
        throw bad("invalid 'withdrawn'");
    }
    if (body.severity !== undefined && body.severity !== null) {
        if (!Array.isArray(body.severity) ||
            !body.severity.every((s) => isPlainObject(s) && typeof s.type === "string" && typeof s.score === "string")) {
            throw bad("invalid 'severity'");
        }
    }
    if (body.database_specific !== undefined && body.database_specific !== null && !isPlainObject(body.database_specific)) {
        throw bad("invalid 'database_specific'");
    }
    if (body.aliases !== undefined &&
        body.aliases !== null &&
        !(Array.isArray(body.aliases) && body.aliases.every((a) => typeof a === "string"))) {
        throw bad("invalid 'aliases'");
    }
    return body;
}
// querybatch returns only {id, modified}; the full record (published, withdrawn, severity,
// aliases) comes from /v1/vulns/<id>. Failures are returned, not swallowed.
export async function enrichVulns(vulns) {
    const ids = [...new Set(vulns.map((v) => v.id))];
    const details = new Map();
    const failed = [];
    let next = 0;
    async function worker() {
        while (next < ids.length) {
            const id = ids[next++];
            try {
                details.set(id, await getVulnDetails(id));
            }
            catch (e) {
                failed.push({ id, error: e.message });
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, () => worker()));
    return { details, failed };
}
const DB_SEVERITY_LABELS = {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MODERATE: "MEDIUM", // GitHub advisories use MODERATE
    MEDIUM: "MEDIUM",
    LOW: "LOW",
};
// Returns UNKNOWN when there is no usable rating (no database label, no CVSS v3 vector, e.g.
// CVSS v4 only). UNKNOWN means "not rated", not "low"; callers must not filter it out.
export function deriveSeverityLabel(vuln) {
    const dbSeverity = vuln.database_specific?.severity;
    if (typeof dbSeverity === "string") {
        const label = DB_SEVERITY_LABELS[dbSeverity.toUpperCase()];
        if (label)
            return label;
    }
    for (const s of vuln.severity ?? []) {
        const score = cvss3BaseScore(s.score);
        if (score !== null)
            return cvssScoreToLabel(score);
    }
    return "UNKNOWN";
}
// CVSS v3.0/v3.1 base score, per the FIRST specification (section 7 formulas).
const CVSS3_WEIGHTS = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
    AC: { L: 0.77, H: 0.44 },
    UI: { N: 0.85, R: 0.62 },
    CIA: { H: 0.56, L: 0.22, N: 0 },
};
function roundUp(value) {
    const int = Math.round(value * 100000);
    if (int % 10000 === 0)
        return int / 100000;
    return (Math.floor(int / 10000) + 1) / 10;
}
export function cvss3BaseScore(vector) {
    if (!/^CVSS:3\.[01]\//.test(vector))
        return null;
    const m = {};
    for (const part of vector.split("/").slice(1)) {
        const [k, v] = part.split(":");
        if (k && v)
            m[k] = v;
    }
    const av = CVSS3_WEIGHTS.AV[m.AV];
    const ac = CVSS3_WEIGHTS.AC[m.AC];
    const ui = CVSS3_WEIGHTS.UI[m.UI];
    const c = CVSS3_WEIGHTS.CIA[m.C];
    const i = CVSS3_WEIGHTS.CIA[m.I];
    const a = CVSS3_WEIGHTS.CIA[m.A];
    const scope = m.S;
    if ([av, ac, ui, c, i, a].some((x) => x === undefined) || (scope !== "U" && scope !== "C")) {
        return null;
    }
    const changed = scope === "C";
    const prWeights = changed ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };
    const pr = prWeights[m.PR];
    if (pr === undefined)
        return null;
    const iss = 1 - (1 - c) * (1 - i) * (1 - a);
    const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
    if (impact <= 0)
        return 0;
    const exploitability = 8.22 * av * ac * pr * ui;
    return changed
        ? roundUp(Math.min(1.08 * (impact + exploitability), 10))
        : roundUp(Math.min(impact + exploitability, 10));
}
function cvssScoreToLabel(score) {
    if (score >= 9)
        return "CRITICAL";
    if (score >= 7)
        return "HIGH";
    if (score >= 4)
        return "MEDIUM";
    // CVSS 0.0 ("None") is a real rating, so it gets the lowest label rather than UNKNOWN, which
    // is reserved for a missing or unsupported rating.
    return "LOW";
}
const SEVERITY_ORDER = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
export function severityRank(label) {
    const idx = SEVERITY_ORDER.indexOf(label.toUpperCase());
    return idx === -1 ? 0 : idx;
}
export function worstSeverity(labels) {
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
//# sourceMappingURL=osv.js.map