//
export const RETRY_DELAY_MS = 5000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryAfterPause(fn: () => void): Promise<void> {
  await sleep(RETRY_DELAY_MS);
  fn();
}

export function listItems(items: string[], opts: { limit?: number } = {}): string[] {
  return items.slice(0, opts.limit ?? 50);
}

export function emptyPreview(items: string[]): string[] {
  return listItems(items, { limit: 0 });
}

export function greet(name: string): string {
  const display = name || 'Anonymous';
  return 'Hello, ' + display;
}

export type Attempts = 1 | 2 | 3 | 4 | 5;

export function attemptsFor(retries?: Attempts): Attempts {
  return retries || 3;
}

export function hasTag(tags: string[], x: string): boolean {
  return tags.indexOf(x) !== -1;
}

export const maxRetries = -1; // -1 means unlimited
