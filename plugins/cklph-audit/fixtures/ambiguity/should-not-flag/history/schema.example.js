//
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
  },
};
