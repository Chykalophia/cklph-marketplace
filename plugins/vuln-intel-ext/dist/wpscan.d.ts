export interface WPScanVuln {
    title: string;
    fixed_in?: string | null;
    references?: Record<string, string[]>;
    cvss?: {
        score?: string | number;
        vector?: string;
        severity?: string;
    } | number | null;
}
export interface WPScanResult {
    vulnerabilities: WPScanVuln[];
    cached: boolean;
    cached_at?: string;
}
export declare function cvssScore(cvss: WPScanVuln["cvss"]): number | null;
export declare function lookup(type: "core" | "plugin" | "theme", name: string, version?: string): Promise<WPScanResult>;
