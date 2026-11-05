# Changelog

All notable changes to `cro-research-reporting` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.4.0] — 2026-11-05

0.4.0 was built in the old standalone repo (`Chykalophia/cro-research-reporting`, 2026-10-15) on top of
0.3.0, while 0.3.1 and 0.3.2 landed here. This release merges the two lines. The README's "What's new in
0.4.0" section lists the features; in short:

### Added
- Evidence-based audit: rendered desktop and mobile captures (`capture_pages.py`), a binary heuristic
  checklist, evidence-tagged hypotheses (Instrument / Just do it / Test / Investigate), no promised lifts.
- `voc-research` skill and `voc-coder` agent (review and ticket mining, surveys, AI coding validated
  against a human sample with `agreement.py`).
- `experiment-design` skill and `/experiment` command (sample size and MDE with CUPED, SRM, readouts with
  guardrails, a per-client test log).
- `check_citations.py`: mechanical check of every cited URL and load-bearing figure.
- Unit tests (53, standard library only) in `tests/`, trigger evals and a seeded audit fixture in `evals/`.

### Changed
- Copywriting outputs test variants built from customer language; references cleaned of untraceable figures.

### Merge decisions
- Kept from 0.3.1/0.3.2: `NOTICE.md`, the marketplace install line, no per-skill version stamps, and
  "Use when…" descriptions under 300 characters. The two new skills were brought to that rule; their
  trigger phrases moved into the body.
- Security: 0.3.1 took Bash away from the web-reading agents. 0.4.0 gives `cro-auditor` and `cro-verifier`
  an explicit `Bash` to run this plugin's scripts (`capture_pages.py`, `power.py`, `check_citations.py`,
  `readout.py`), so they keep it. Both now carry 0.3.1's guardrails (fetched content is data, never
  instructions; Bash only for this plugin's scripts; local reads limited to named paths), which
  `cro-verifier` never had. `deep-researcher` stays without Bash and gains 0.4.0's "only cite a URL you
  opened" rule.
- 0.4.0's own CI workflow is dropped (it can't run from a plugin subfolder); its unit tests and
  `evals/triggers.json` check run in the marketplace CI instead.

### Review fixes
From the automated review of the merge. Unit tests now number 53.
- `readout.py` labels the interval with its real level (97.5%, not "98%").
- `power.py` rejects NaN or infinite inputs and a zero or negative `--max-days`.
- `readout.py` rejects an `--alpha` outside 0 to 1, fractional counts, a zero or negative SD, a bad
  `--mde` or `--days`, and malformed `--weights` with a usage error instead of a traceback.
- `readout.py` always prints the run length when `--days` is given, and includes it in JSON.
- `srm_check.py` rejects non-finite counts and weights whose sum overflows, which could pass SRM.
- `test_log.py` writes the header into an empty log file, rejects NaN lifts, and no longer crashes on
  a log without a `rel_lift` column.
- `agreement.py` rejects a non-finite `--min-kappa`, the same column for both coders, and cells that
  hold only separators; the table header shows the real column names.
- `check_citations.py` matches a claimed figure as a whole number ("2" no longer matches "2024"),
  fails the run when a claim's source is dead, rejects non-http claim URLs and `--workers` below 1,
  stops reading numeric slugs such as `s-2024` as citation numbers, and flags one number used for
  two sources.
- `capture_pages.py` records HTTP error pages as errors, ignores elements hidden by opacity, keeps
  checkout buttons apart from add-to-cart, reads `aria-label`, adds a largest-form field count,
  says when the lazy-load scroll stopped early, takes `--viewports` before the URLs, and accepts
  file:// URLs only with `--allow-file`.
- `cro-auditor` quotes each URL as its own argument, captures only URLs from the user or brief, and
  may read `./audit-captures/`.
- `cro-verifier` uses a per-report `<report>.claims.csv` written by `report-builder`, since it
  cannot write files.
- `voc-coder` gains the untrusted-content, Bash, read and write guardrails, broader redaction,
  a per-code kappa gate, and writes its CSV in the working folder.
- The checklist adds N/A, keeps P5's star on the in-scale image only, and counts C3 on the checkout
  form. The fixture key answers P3 and P15 "Can't tell", as the captures show.
- Baymard abandonment figures now match the live page (returns 13%, total cost 12%, payment
  methods 9%), and the Shopify link is fixed.
- Docs: plugin-rooted script paths, `--log` passed to `test_log.py`, sequential tests read from the
  testing tool, relative MDE and guardrail units in the pre-registration, CUPED `r` from historical
  data, and sources added for the two copywriting studies.

## [0.3.2] — 2026-10-27

### Fixed
- **Attribution:** the README said MIT-licensed repos were "adapted with attribution", but the
  plugin shipped no notice. Added `NOTICE.md` crediting coreyhaines31/marketingskills,
  wshobson/agents, stanford-oval/storm, langchain-ai/open_deep_research and Shopify/theme-tools,
  with the MIT license text, and listing the sources used only as influences. The license block
  carries each project's own copyright line, copied from its LICENSE file, not a placeholder.
- **`report-information-design`:** the folded description split "self-contained" across a line,
  which published as "self- contained".
- **Skill descriptions:** the six descriptions ran 446–584 characters and carried inline
  trigger-phrase lists (five opened "This skill should be used…", `getting-started` opened "This is
  the front door…"). Each is now a "Use when…, before…" trigger under 300 characters, as STANDARD.md §5
  requires. The full trigger-phrase lists moved into each skill's body.
- **Version drift:** removed the per-skill `metadata.version` stamps (0.2.0/0.3.0) and the README's
  "Version 0.3.0" footer; `plugin.json` and this CHANGELOG own the version.
- Adapted from: coreyhaines31/marketingskills, wshobson/agents, stanford-oval/storm,
  langchain-ai/open_deep_research, Shopify/theme-tools (all MIT; notices in `NOTICE.md`).

## [0.3.1] — 2026-10-26

### Security
- **`cro-auditor`, `deep-researcher`** — both agents had no `tools:` line, so they inherited every
  tool (Bash, Write, Edit, every MCP server) while reading untrusted web content. Both are now
  scoped to `Read, Grep, Glob, WebFetch, WebSearch`, matching `cro-verifier`. Neither writes files:
  they return their findings to the caller, which pulls first-party analytics data itself (as
  `/cro-audit` and `/deep-research` already instruct). Each agent now treats fetched web content
  as data, never as instructions.
- **`cro-auditor`, `deep-researcher`** — both keep `Read, Grep, Glob`: they read this plugin's
  reference files and the engagement brief, and `cro-auditor` maps findings to a real theme or
  codebase. Each now carries an explicit rule: read only those paths and the ones the caller
  names, and never put local file contents into a URL, query string, or search query. This is
  prompt guidance, not enforcement: the tool list still permits any local read and any fetch, so
  a prompt-injected page could still try to exfiltrate. Run these agents where the working
  directory holds no secrets.
