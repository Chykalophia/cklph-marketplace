import { getWPScanCache, setWPScanCache } from "./db.js";

// NOT api.wpscan.com - that host has no A record at all (DNS returns the zone
// SOA and nothing else), so every lookup died with ENOTFOUND regardless of
// whether WPSCAN_TOKEN was set. The missing-token error message made that look
// like a config problem for as long as nobody checked DNS.
const WPSCAN_API = "https://wpscan.com/api/v3";
const CACHE_TTL_HOURS = 24;
const REQUEST_TIMEOUT_MS = 15000;
// Bumped when the cached shape changes. Entries without it (written before 1.0.3, when a 404
// or an unparsed response was cached as an empty list) are treated as stale and refetched.
const CACHE_FORMAT = 2;

export interface WPScanVuln {
  title: string;
  fixed_in?: string | null;
  references?: Record<string, string[]>;
  // v3 returns an object ({score, vector, severity}); older data may hold a bare number.
  cvss?: { score?: string | number; vector?: string; severity?: string } | number | null;
}

export interface WPScanResult {
  vulnerabilities: WPScanVuln[];
  cached: boolean;
  cached_at?: string;
}

interface CacheEntry {
  format: number;
  vulnerabilities: WPScanVuln[];
}

function isCacheEntry(data: unknown): data is CacheEntry {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as CacheEntry).format === CACHE_FORMAT &&
    Array.isArray((data as CacheEntry).vulnerabilities)
  );
}

export function cvssScore(cvss: WPScanVuln["cvss"]): number | null {
  if (typeof cvss === "number") return cvss;
  if (cvss && typeof cvss === "object" && cvss.score !== undefined && cvss.score !== null) {
    const n = Number(cvss.score);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Every failure (no token, 404, unexpected body) throws. None of them is "no vulnerabilities",
// and none is cached.
export async function lookup(
  type: "core" | "plugin" | "theme",
  name: string,
  version?: string,
): Promise<WPScanResult> {
  let path: string;
  let responseKey: string;
  let cacheName: string;
  if (type === "core") {
    if (!version || !/^\d+(\.\d+)*$/.test(version)) {
      throw new Error(
        "Core lookups need 'version' set to the WordPress version (e.g. '6.4.2'); 'name' is not used for core.",
      );
    }
    // The v3 API wants the version with its dots removed: 5.6.1 -> /wordpresses/561.
    path = `/wordpresses/${version.replace(/\./g, "")}`;
    responseKey = version;
    cacheName = "wordpress";
  } else {
    path = `/${type}s/${encodeURIComponent(name)}`;
    responseKey = name;
    cacheName = name;
  }

  const cached = getWPScanCache(type, cacheName, version);
  if (cached && isCacheEntry(cached.data)) {
    const cacheAge = Date.now() - new Date(cached.cached_at).getTime();
    const maxAge = CACHE_TTL_HOURS * 60 * 60 * 1000;
    if (cacheAge < maxAge) {
      return {
        vulnerabilities: cached.data.vulnerabilities,
        cached: true,
        cached_at: cached.cached_at,
      };
    }
  }

  const token = process.env.WPSCAN_TOKEN;
  if (!token) {
    throw new Error("WPSCAN_TOKEN is not set");
  }

  const resp = await fetch(`${WPSCAN_API}${path}`, {
    headers: {
      Authorization: `Token token=${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(
        type === "core"
          ? `WPScan has no record of WordPress ${version} (404). Check the version.`
          : `WPScan has no record of ${type} '${name}' (404). Check the slug; this is not a clean result.`,
      );
    }
    throw new Error(`WPScan API returned ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  }

  const data = (await resp.json()) as Record<string, unknown> | null;

  // v3 keys the body by slug (plugins/themes) or dotted version (core):
  // {"<key>": {..., "vulnerabilities": [ ... ]}}
  let entry: unknown = data && typeof data === "object" ? data[responseKey] : undefined;
  if (entry === undefined && data && typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 1) entry = data[keys[0]];
  }
  const rawVulns = (entry as { vulnerabilities?: unknown } | undefined)?.vulnerabilities;
  let vulns: WPScanVuln[];
  if (Array.isArray(rawVulns)) {
    vulns = rawVulns as WPScanVuln[];
  } else if (rawVulns && typeof rawVulns === "object") {
    vulns = Object.values(rawVulns as Record<string, WPScanVuln>);
  } else {
    throw new Error(
      `WPScan returned an unexpected response for ${type} '${type === "core" ? version : name}' (no vulnerabilities list under '${responseKey}')`,
    );
  }

  const toCache: CacheEntry = { format: CACHE_FORMAT, vulnerabilities: vulns };
  setWPScanCache(type, cacheName, version, toCache);

  return { vulnerabilities: vulns, cached: false };
}
