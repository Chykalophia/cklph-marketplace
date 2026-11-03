//
export const LOG_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    level: { type: 'string', enum: ['debug', 'warn', 'error'] },
  },
};
