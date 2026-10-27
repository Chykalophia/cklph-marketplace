// exit.mjs — the scheduler contract for run_checks.mjs. No dependencies, so it loads even when
// playwright or pngjs cannot, and a broken install still exits ERROR rather than REGRESSIONS.
// Never exit with the count: 256 regressions would read as 0.
export const EXIT = { CLEAN: 0, REGRESSIONS: 1, ERROR: 2 };
export const exitCodeFor = (confirmedCount) => (confirmedCount > 0 ? EXIT.REGRESSIONS : EXIT.CLEAN);
