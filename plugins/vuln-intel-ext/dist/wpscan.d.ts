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
export declare function lookup(type: "core" | "plugin" | "theme", name: string, version?: string): Promise<WPScanResult>;
