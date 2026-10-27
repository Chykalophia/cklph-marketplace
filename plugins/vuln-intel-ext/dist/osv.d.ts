import type { PackageRef } from "./db.js";
export interface OsvVuln {
    id: string;
    summary?: string;
    published?: string;
    modified?: string;
    withdrawn?: string | null;
    aliases?: string[];
    severity?: Array<{
        type: string;
        score: string;
    }>;
    database_specific?: Record<string, unknown>;
}
export interface OsvBatchResult {
    package: PackageRef;
    vulns: OsvVuln[];
    error?: string;
}
export declare function queryBatch(packages: PackageRef[]): Promise<OsvBatchResult[]>;
export declare function querySingle(pkg: PackageRef): Promise<OsvVuln[]>;
export declare function getVulnDetails(id: string): Promise<OsvVuln>;
export interface EnrichResult {
    details: Map<string, OsvVuln>;
    failed: Array<{
        id: string;
        error: string;
    }>;
}
export declare function enrichVulns(vulns: OsvVuln[]): Promise<EnrichResult>;
export declare function deriveSeverityLabel(vuln: OsvVuln): string;
export declare function cvss3BaseScore(vector: string): number | null;
export declare function severityRank(label: string): number;
export declare function worstSeverity(labels: string[]): string;
