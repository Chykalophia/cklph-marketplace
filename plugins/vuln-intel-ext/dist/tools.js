import { z } from "zod";
import * as db from "./db.js";
import * as osv from "./osv.js";
import * as wpscan from "./wpscan.js";
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(message) {
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}
function errData(message, data) {
    return {
        content: [{ type: "text", text: JSON.stringify({ error: message, ...data }, null, 2) }],
        isError: true,
    };
}
function toSummary(vuln, pkg) {
    const cveAlias = vuln.aliases?.find((a) => a.startsWith("CVE-"));
    return {
        id: vuln.id,
        cve: cveAlias,
        summary: vuln.summary ?? "(no summary)",
        severity: osv.deriveSeverityLabel(vuln),
        package: pkg.name,
        ecosystem: pkg.ecosystem ?? "unknown",
        published: vuln.published,
        modified: vuln.modified,
        withdrawn: vuln.withdrawn ?? undefined,
        aliases: vuln.aliases ?? [],
    };
}
const SEVERITY_RANK = {
    UNKNOWN: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
};
export function registerTools(server) {
    // ──────────────────────────────────────────────────────────────
    // save_dependency_snapshot
    // ──────────────────────────────────────────────────────────────
    server.tool("save_dependency_snapshot", "Save a named dependency snapshot (e.g. from a lockfile) so diff_since can track what's new for your specific dependencies. Pass packages as an array of {name, version, ecosystem}. Optionally label it (e.g. 'production', 'staging').", {
        packages: z
            .array(z.object({
            name: z.string(),
            version: z.string(),
            ecosystem: z.string().optional(),
        }))
            .min(1)
            .max(5000),
        label: z.string().optional(),
    }, async (args) => {
        const snap = db.saveSnapshot(args.packages, args.label);
        return ok({
            snapshotId: snap.id,
            savedAt: snap.saved_at,
            packageCount: snap.package_count,
            label: snap.label,
        });
    });
    // ──────────────────────────────────────────────────────────────
    // diff_since
    // ──────────────────────────────────────────────────────────────
    server.tool("diff_since", "Find vulnerabilities that are NEW, MODIFIED, or WITHDRAWN for your dependencies since a given timestamp. Pass 'since' as an ISO 8601 timestamp (e.g. '2024-06-01T00:00:00Z'). Optionally pass 'packages' (array of {name, version, ecosystem}); if omitted, uses the last saved dependency snapshot. Optionally filter by minimum 'severity'. Returns only the delta — what changed since that timestamp.", {
        since: z.string().describe("ISO 8601 timestamp of your last scan"),
        packages: z
            .array(z.object({
            name: z.string(),
            version: z.string(),
            ecosystem: z.string().optional(),
        }))
            .optional()
            .describe("Your dependency list. If omitted, uses the last saved snapshot."),
        severity: z
            .enum(["low", "medium", "high", "critical"])
            .optional()
            .describe("Minimum severity filter"),
    }, async (args) => {
        let packages = args.packages;
        let snapshotId = null;
        const sinceDate = new Date(args.since);
        if (isNaN(sinceDate.getTime())) {
            return err(`Invalid 'since' timestamp: ${args.since}. Use ISO 8601 format.`);
        }
        if (!packages || packages.length === 0) {
            const snap = db.getLatestSnapshot();
            if (!snap) {
                return err("No packages provided and no saved dependency snapshot found. Call save_dependency_snapshot first, or pass packages directly.");
            }
            packages = snap.packages;
            snapshotId = snap.id;
        }
        else {
            const snap = db.saveSnapshot(packages);
            snapshotId = snap.id;
        }
        const minSeverityRank = args.severity
            ? SEVERITY_RANK[args.severity.toUpperCase()] ?? 0
            : 0;
        let results;
        try {
            results = await osv.queryBatch(packages);
        }
        catch (e) {
            return err(`OSV API query failed: ${e.message}`);
        }
        // A failed lookup is not a clean result: report it and do not record a scan.
        const failedPackages = results.filter((r) => r.error);
        if (failedPackages.length > 0) {
            return errData(`OSV lookup failed for ${failedPackages.length} of ${packages.length} packages; no scan was recorded. See failedPackages for the cause.`, {
                failedPackages: failedPackages.map((r) => ({
                    name: r.package.name,
                    version: r.package.version,
                    ecosystem: r.package.ecosystem ?? null,
                    error: r.error,
                })),
            });
        }
        // querybatch returns only {id, modified}; published/withdrawn/severity come from the
        // full records. Without them an advisory cannot be classified, so a failure is an error.
        const allVulns = results.flatMap((r) => r.vulns);
        const enrichment = await osv.enrichVulns(allVulns);
        if (enrichment.failed.length > 0) {
            return errData(`Could not fetch ${enrichment.failed.length} OSV advisory records, so they cannot be classified as new, modified or withdrawn; no scan was recorded. Retry later.`, { failedAdvisories: enrichment.failed });
        }
        const newVulns = [];
        const modifiedVulns = [];
        const withdrawnIds = [];
        const allSeverities = [];
        let unknownSeverityCount = 0;
        for (const result of results) {
            for (const vuln of result.vulns) {
                const enriched = enrichment.details.get(vuln.id);
                const summary = toSummary(enriched, result.package);
                // UNKNOWN means "not rated", not "low": it is never removed by the severity filter.
                if (minSeverityRank > 0 &&
                    summary.severity !== "UNKNOWN" &&
                    SEVERITY_RANK[summary.severity] < minSeverityRank) {
                    continue;
                }
                allSeverities.push(summary.severity);
                // Timestamps were validated at the parsing boundary (osv.parseVulnRecord), so an
                // unreadable date can no longer fall through every comparison as "no change".
                const publishedDate = enriched.published ? new Date(enriched.published) : null;
                const modifiedDate = enriched.modified ? new Date(enriched.modified) : null;
                const withdrawnDate = enriched.withdrawn ? new Date(enriched.withdrawn) : null;
                if (withdrawnDate && withdrawnDate > sinceDate) {
                    withdrawnIds.push(enriched.id);
                }
                else if (publishedDate && publishedDate > sinceDate) {
                    newVulns.push(summary);
                }
                else if (modifiedDate && modifiedDate > sinceDate) {
                    modifiedVulns.push(summary);
                }
                else {
                    continue;
                }
                // Every reported advisory (new, modified or withdrawn) that has no rating is counted.
                if (summary.severity === "UNKNOWN")
                    unknownSeverityCount++;
            }
        }
        const worst = osv.worstSeverity(allSeverities);
        db.saveScanRecord({
            snapshot_id: snapshotId,
            since: args.since,
            new_count: newVulns.length,
            modified_count: modifiedVulns.length,
            withdrawn_count: withdrawnIds.length,
            worst_severity: worst,
            vulns_json: JSON.stringify({ newVulns, modifiedVulns, withdrawnIds }),
        });
        return ok({
            since: args.since,
            scannedAt: new Date().toISOString(),
            packagesChecked: packages.length,
            newVulnerabilities: newVulns,
            modifiedVulnerabilities: modifiedVulns,
            withdrawnAdvisories: withdrawnIds,
            summary: {
                newCount: newVulns.length,
                modifiedCount: modifiedVulns.length,
                withdrawnCount: withdrawnIds.length,
                worstSeverity: worst,
                unknownSeverityCount,
            },
            severityNote: "Severity is the advisory database's own rating when present, else the CVSS v3 base score. UNKNOWN = not rated (e.g. CVSS v4 only); UNKNOWN advisories are kept even when a severity filter is set.",
        });
    });
    // ──────────────────────────────────────────────────────────────
    // feed_status
    // ──────────────────────────────────────────────────────────────
    server.tool("feed_status", "Check the freshness of vulnerability data sources and when your last diff_since scan ran. Pings the OSV API to confirm reachability. The AI should call this before an audit to know if data is fresh.", async () => {
        const lastScan = db.getLatestScan();
        const osvStart = Date.now();
        let osvReachable = false;
        let osvLatency = 0;
        try {
            const resp = await fetch("https://api.osv.dev/v1/vulns/CVE-2021-23369", {
                signal: AbortSignal.timeout(5000),
            });
            osvReachable = resp.ok;
            osvLatency = Date.now() - osvStart;
        }
        catch {
            osvLatency = Date.now() - osvStart;
        }
        const warnings = [];
        if (!osvReachable) {
            warnings.push("OSV API is not reachable. Vulnerability queries may fail.");
        }
        if (lastScan) {
            const scanAge = Date.now() - new Date(lastScan.scanned_at).getTime();
            const daysSince = Math.floor(scanAge / (1000 * 60 * 60 * 24));
            if (daysSince > 30) {
                warnings.push(`Last scan was ${daysSince} days ago. Run diff_since to check for new vulnerabilities.`);
            }
        }
        else {
            warnings.push("No scan history found. Run diff_since to establish a baseline.");
        }
        return ok({
            lastScan: lastScan
                ? {
                    timestamp: lastScan.scanned_at,
                    since: lastScan.since,
                    newCount: lastScan.new_count,
                    modifiedCount: lastScan.modified_count,
                    withdrawnCount: lastScan.withdrawn_count,
                    worstSeverity: lastScan.worst_severity,
                }
                : null,
            sources: [
                {
                    source: "osv",
                    reachable: osvReachable,
                    latencyMs: osvLatency,
                },
            ],
            warnings,
        });
    });
    // ──────────────────────────────────────────────────────────────
    // wp_scan
    // ──────────────────────────────────────────────────────────────
    server.tool("wp_scan", "Look up WordPress core, plugin, or theme vulnerabilities via the WPScan API. For core, pass type 'core' and the WordPress version (e.g. version '6.4.2'; version is required and name is ignored). For plugins and themes, pass type 'plugin' or 'theme' and the slug as name (e.g. 'elementor', 'twentytwentyfour'). A slug or version WPScan does not know is an error, not a clean result. Successful results are cached for 24 hours. Requires WPSCAN_TOKEN env var.", {
        type: z.enum(["core", "plugin", "theme"]),
        name: z.string().describe("Plugin or theme slug. Ignored for core."),
        version: z
            .string()
            .optional()
            .describe("Required for core (WordPress version, e.g. '6.4.2'). Optional for plugins and themes."),
    }, async (args) => {
        if (!process.env.WPSCAN_TOKEN) {
            return err("WPSCAN_TOKEN environment variable is not set. WordPress vulnerability lookup requires a WPScan API token. Get one at https://wpscan.com/api/");
        }
        try {
            const result = await wpscan.lookup(args.type, args.name, args.version);
            return ok({
                type: args.type,
                name: args.name,
                version: args.version ?? null,
                vulnerabilities: result.vulnerabilities.map((v) => ({
                    title: v.title,
                    fixedIn: v.fixed_in ?? null,
                    cvss: wpscan.cvssScore(v.cvss),
                    references: v.references ?? {},
                })),
                cached: result.cached,
                cachedAt: result.cached_at ?? null,
                count: result.vulnerabilities.length,
            });
        }
        catch (e) {
            return err(`WPScan lookup failed: ${e.message}`);
        }
    });
}
//# sourceMappingURL=tools.js.map