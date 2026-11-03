//
export interface Plan {
  unlimited: boolean;
  requests: number;
}

export function quotaFor(plan: Plan | null): number {
  if (!plan) return -1;
  if (plan.unlimited) return -1;
  return plan.requests;
}

const allow = (): boolean => true;
const deny = (): boolean => false;

export function checkQuota(p: Plan | null, used: number): boolean {
  const quota = quotaFor(p);
  if (quota === -1) return allow();
  return used < quota ? allow() : deny();
}
