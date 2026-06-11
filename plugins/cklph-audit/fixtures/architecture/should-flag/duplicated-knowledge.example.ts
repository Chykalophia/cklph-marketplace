// FIXTURE — architecture lens · should-flag (RECALL)
// Planted defect: DUPLICATED KNOWLEDGE. The free-tier rule list lives in two places.
// Expected verdict: FLAG. Survives verify because changing the business rule (e.g. raising
// the rule cap, or charging for the "schedule" feature) forces an edit in BOTH functions —
// that is the definition of duplicated knowledge, and the fix is to extract one source of truth.

// --- place 1: the API guard ---------------------------------------------------
export function canCreateRuleOnFreeTier(currentRuleCount: number): boolean {
  // free tier: max 5 rules, no scheduling, no AI replies
  if (currentRuleCount >= 5) return false;
  return true;
}

export function freeTierAllowsFeature(feature: string): boolean {
  // SAME business rule, restated
  const blocked = ["scheduling", "ai-replies"];
  return !blocked.includes(feature);
}

// --- place 2: the pricing page copy generator (DUPLICATES the rule above) -----
export function describeFreeTier(): string {
  // The "5 rules / no scheduling / no AI replies" knowledge is encoded a SECOND time.
  // If product changes the free tier, this drifts out of sync with canCreateRuleOnFreeTier.
  const maxRules = 5;
  const blocked = ["scheduling", "ai-replies"];
  return `Free tier: up to ${maxRules} rules, excludes ${blocked.join(" and ")}.`;
}

// Correct shape would be: a single FREE_TIER = { maxRules: 5, blockedFeatures: [...] }
// source of truth that all three functions read from.
