//
const ITEMS = ['a', 'b', 'c'];

export function listItems(opts: { limit?: number } = {}): string[] {
  const limit = opts.limit || 50;
  return ITEMS.slice(0, limit);
}

export function emptyPreview(): string[] {
  return listItems({ limit: 0 });
}
