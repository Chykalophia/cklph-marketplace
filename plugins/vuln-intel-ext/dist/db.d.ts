import Database from "better-sqlite3";
export interface PackageRef {
    name: string;
    version: string;
    ecosystem?: string;
}
export interface SnapshotRecord {
    id: number;
    label: string | null;
    packages: PackageRef[];
    package_count: number;
    saved_at: string;
}
export interface ScanRecord {
    id: number;
    snapshot_id: number | null;
    since: string;
    scanned_at: string;
    new_count: number;
    modified_count: number;
    withdrawn_count: number;
    worst_severity: string | null;
    vulns_json: string;
}
export declare function getDb(): Database.Database;
export declare function saveSnapshot(packages: PackageRef[], label?: string): SnapshotRecord;
export declare function getLatestSnapshot(label?: string): SnapshotRecord | null;
export declare function saveScanRecord(rec: {
    snapshot_id: number | null;
    since: string;
    new_count: number;
    modified_count: number;
    withdrawn_count: number;
    worst_severity: string | null;
    vulns_json: string;
}): void;
export declare function getLatestScan(): ScanRecord | null;
export declare function getWPScanCache(type: string, name: string, version?: string): {
    data: unknown;
    cached_at: string;
} | null;
export declare function setWPScanCache(type: string, name: string, version: string | undefined, data: unknown): void;
