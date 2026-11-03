// §10.1 / §15 LEAK: the ONE list of repo paths deleted from the throwaway gate tree before any
// ambiguity gate run. Imported by tests/ambiguity-fixtures.test.mjs (which proves no surviving file
// quotes fixture prose) and by the gate runner, so the documented list and the enforced list cannot
// drift. Paths are repo-root-relative; a trailing '/' means the whole directory.
//
// Why each entry:
// - fixtures/ambiguity/, fixtures/README.md, SPEC-v4-ambiguity.md, docs/proof/ambiguity-lens/: case
//   paths, labels.json, the §9.2 fixture table and past scores.
// - tests/: tools.test.mjs and ambiguity-fixtures.test.mjs quote fixture sentences as named cases.
// - skills/audit-backtest/: states the GB-1/GB-2 expected verdicts line by line.
// - skills/agent-config-lens/: the live checklist is the post-fix twin of the PR #22 fixture row.
// - plugins/cklph-os/: its CHANGELOG, spec-authoring-rules and two-reviewer-gate use the SECURITY.md
//   clause as the worked "two readings" example. The gate does not load cklph-os from the tree.
export const GATE_TREE_DELETE = [
  'plugins/cklph-audit/fixtures/ambiguity/',
  'plugins/cklph-audit/fixtures/README.md',
  'plugins/cklph-audit/SPEC-v4-ambiguity.md',
  'plugins/cklph-audit/tests/',
  'plugins/cklph-audit/skills/audit-backtest/',
  'plugins/cklph-audit/skills/agent-config-lens/',
  'plugins/cklph-os/',
  'docs/proof/ambiguity-lens/',
];

export const isGateTreeDeleted = (file) =>
  GATE_TREE_DELETE.some(d => (d.endsWith('/') ? file.startsWith(d) : file === d));

// Fixture ↔ surviving-file overlaps that are the point of the case, not a leak: a should-not-flag
// contract-match case quotes the real contract it agrees with (the report-format counts line, the
// engine's ruleCheck status union). Keyed `<fixture path under fixtures/ambiguity> ~ <repo file>`.
export const GATE_MIRROR_OK = new Set([
  'should-not-flag/contract-match/output-format.example.md ~ plugins/cklph-audit/skills/audit-report-format/SKILL.md',
  'should-not-flag/contract-match/output-format.example.md ~ plugins/cklph-audit/workflows/audit.workflow.js',
]);
