import { getWPScanCache, setWPScanCache } from "./db.js";

// NOT api.wpscan.com - that host has no A record at all (DNS returns the zone
// SOA and nothing else), so every lookup died with ENOTFOUND regardless of
// whether WPSCAN_TOKEN was set. The missing-token error message made that look
// like a config problem for as long as nobody checked DNS.
const WPSCAN_API = "https://wpscan.com/api/v3";
const CACHE_TTL_HOURS = 24;

export interface WPScanVuln {
  title: string;
  fixed_in?: string;
  references?: Record<string, string[]>;
  cvss?: number;
}

export interface WPScanResult {
  vulnerabilities: WPScanVuln[];
  cached: boolean;
  cached_at?: string;
}

export async function lookup(
  type: "core" | "plugin" | "theme",
  name: string,
  version?: string,
): Promise<WPScanResult> {
  const cached = getWPScanCache(type, name, version);
  if (cached) {
    const cacheAge = Date.now() - new Date(cached.cached_at).getTime();
    const maxAge = CACHE_TTL_HOURS * 60 * 60 * 1000;
    if (cacheAge < maxAge) {
      return {
        vulnerabilities: cached.data as WPScanVuln[],
        cached: true,
        cached_at: cached.cached_at,
      };
    }
  }

  const token = process.env.WPSCAN_TOKEN;
  if (!token) {
    return {
      vulnerabilities: [],
      cached: false,
    };
  }

  const path =
    type === "core"
      ? `/wordpresses/${name}`
      : `/${type}s/${name}`;

  const url = `${WPSCAN_API}${path}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Token token=${token}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      setWPScanCache(type, name, version, []);
      return { vulnerabilities: [], cached: false };
    }
    throw new Error(`WPScan API returned ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;

  let vulns: WPScanVuln[] = [];
  if (type === "core") {
    const versionData = (data[version ?? ""] ?? data) as {
      vulnerabilities?: Record<string, WPScanVuln>;
    };
    vulns = versionData.vulnerabilities
      ? Object.values(versionData.vulnerabilities)
      : [];
  } else {
    const pluginData = data as {
      vulnerabilities?: Record<string, WPScanVuln>;
    };
    vulns = pluginData.vulnerabilities ? Object.values(pluginData.vulnerabilities) : [];
  }

  setWPScanCache(type, name, version, vulns);

  return { vulnerabilities: vulns, cached: false };
}
