//
export const RETRY_DELAY = 5;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryLater(fn: () => void): void {
  setTimeout(fn, RETRY_DELAY);
}

export async function retryAfterPause(fn: () => void): Promise<void> {
  await sleep(RETRY_DELAY * 1000);
  fn();
}
