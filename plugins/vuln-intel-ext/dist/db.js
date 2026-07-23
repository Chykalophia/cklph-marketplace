import Database from "better-sqlite3";
import { homedir } from "os";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
const SCHEMA = `
CREATE TABLE IF NOT EXISTS dependency_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT,
  packages_json TEXT NOT NULL,
  package_count INTEGER NOT NULL,
  saved_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id    INTEGER REFERENCES dependency_snapshots(id),
  since          TEXT NOT NULL,
  scanned_at     TEXT DEFAULT (datetime('now')),
  new_count      INTEGER,
  modified_count INTEGER,
  withdrawn_count INTEGER,
  worst_severity TEXT,
  vulns_json     TEXT
);

CREATE TABLE IF NOT EXISTS wpscan_cache (
  type      TEXT NOT NULL,
  name      TEXT NOT NULL,
  version   TEXT,
  data_json TEXT NOT NULL,
  cached_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (type, name, version)
);
`;
let db = null;
export function getDb() {
    if (db)
        return db;
    const dbPath = process.env.VULN_INTEL_DB_PATH
        ? process.env.VULN_INTEL_DB_PATH
        : join(homedir(), ".vuln-intel-ext", "snapshot.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    return db;
}
export function saveSnapshot(packages, label) {
    const d = getDb();
    const stmt = d.prepare(`INSERT INTO dependency_snapshots (label, packages_json, package_count)
     VALUES (?, ?, ?)`);
    const info = stmt.run(label ?? null, JSON.stringify(packages), packages.length);
    return {
        id: Number(info.lastInsertRowid),
        label: label ?? null,
        packages,
        package_count: packages.length,
        saved_at: new Date().toISOString(),
    };
}
export function getLatestSnapshot(label) {
    const d = getDb();
    const row = label
        ? d
            .prepare(`SELECT * FROM dependency_snapshots WHERE label = ? ORDER BY saved_at DESC LIMIT 1`)
            .get(label)
        : d
            .prepare(`SELECT * FROM dependency_snapshots ORDER BY saved_at DESC LIMIT 1`)
            .get();
    if (!row)
        return null;
    return {
        id: row.id,
        label: row.label,
        packages: JSON.parse(row.packages_json),
        package_count: row.package_count,
        saved_at: row.saved_at,
    };
}
export function saveScanRecord(rec) {
    const d = getDb();
    d.prepare(`INSERT INTO scan_history
      (snapshot_id, since, new_count, modified_count, withdrawn_count, worst_severity, vulns_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(rec.snapshot_id, rec.since, rec.new_count, rec.modified_count, rec.withdrawn_count, rec.worst_severity, rec.vulns_json);
}
export function getLatestScan() {
    const d = getDb();
    const row = d
        .prepare(`SELECT * FROM scan_history ORDER BY scanned_at DESC LIMIT 1`)
        .get();
    if (!row)
        return null;
    return {
        id: row.id,
        snapshot_id: row.snapshot_id,
        since: row.since,
        scanned_at: row.scanned_at,
        new_count: row.new_count,
        modified_count: row.modified_count,
        withdrawn_count: row.withdrawn_count,
        worst_severity: row.worst_severity,
        vulns_json: row.vulns_json,
    };
}
export function getWPScanCache(type, name, version) {
    const d = getDb();
    const row = d
        .prepare(`SELECT data_json, cached_at FROM wpscan_cache WHERE type = ? AND name = ? AND version IS ?`)
        .get(type, name, version ?? null);
    if (!row)
        return null;
    return { data: JSON.parse(row.data_json), cached_at: row.cached_at };
}
export function setWPScanCache(type, name, version, data) {
    const d = getDb();
    d.prepare(`INSERT OR REPLACE INTO wpscan_cache (type, name, version, data_json, cached_at)
     VALUES (?, ?, ?, ?, datetime('now'))`).run(type, name, version ?? null, JSON.stringify(data));
}
//# sourceMappingURL=db.js.map