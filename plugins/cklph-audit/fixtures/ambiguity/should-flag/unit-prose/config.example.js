//
export function startVoter(cfg, drop) {
  return setTimeout(drop, cfg.verify.maxWait ?? 300);
}
