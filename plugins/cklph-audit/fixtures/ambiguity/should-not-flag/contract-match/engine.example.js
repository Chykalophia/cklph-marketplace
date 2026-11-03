//
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },
  },
};

export const CONTROL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['violation', 'verified-safe', 'not-applicable'] },
  },
};

export const EXPLOIT_SCHEMA = {
  type: 'object',
  properties: {
    confidence: { type: 'string', enum: ['confirmed-exploitable', 'likely', 'refuted'] },
  },
};

// Coverage matrix row for one rule: the first check's status, or 'unchecked' when no check came back.
export function closeRule(rule, checks) {
  const hit = checks.find(c => c.ruleId === rule.id);
  return { ...rule, status: hit ? hit.status : 'unchecked' };
}
