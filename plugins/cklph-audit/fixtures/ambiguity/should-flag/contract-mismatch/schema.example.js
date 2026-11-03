//
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },
  },
};

export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    counts: {
      type: 'object',
      properties: { critical: { type: 'number' }, high: { type: 'number' }, medium: { type: 'number' }, low: { type: 'number' }, info: { type: 'number' } },
    },
  },
};
