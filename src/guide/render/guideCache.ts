const MAX_GUIDES = 4;

export class GuideCache {
  private previous = new Map<string, unknown>();
  private current = new Map<string, unknown>();
  private keys: Record<string, string> = {};

  begin(partKeys: Record<string, string>) {
    this.current = new Map();
    this.keys = partKeys;
  }

  partsKey(ids: Iterable<string>): string {
    return [...ids]
      .map((id) => this.keys[id] ?? id)
      .sort()
      .join(',');
  }

  take<T>(key: string, make: () => T): T {
    const known = (this.current.get(key) ?? this.previous.get(key)) as T | undefined;
    const value = known ?? make();

    this.current.set(key, value);

    return value;
  }

  async takeAsync<T>(key: string, make: () => Promise<T>): Promise<T> {
    const known = (this.current.get(key) ?? this.previous.get(key)) as T | undefined;
    const value = known ?? (await make());

    this.current.set(key, value);

    return value;
  }

  commit() {
    this.previous = this.current;
    this.current = new Map();
  }
}

const caches = new Map<string, GuideCache>();

export function guideCache(guideId: string): GuideCache {
  const known = caches.get(guideId);

  caches.delete(guideId);

  const cache = known ?? new GuideCache();

  caches.set(guideId, cache);

  if (caches.size > MAX_GUIDES) caches.delete(caches.keys().next().value!);

  return cache;
}
