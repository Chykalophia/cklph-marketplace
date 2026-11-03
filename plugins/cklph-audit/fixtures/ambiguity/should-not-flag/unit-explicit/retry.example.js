//
export function startVoter(cfg, drop) {
  return setTimeout(drop, cfg.verify.maxWaitMs ?? 300000);
}

export function scheduleRetry(cfg, fn) {
  return setTimeout(fn, cfg.retry.delay * 1000);
}
