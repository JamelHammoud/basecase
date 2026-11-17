export const compareElectricalIds = (a: string, b: string) => (a < b ? -1 : Number(a > b));

export function electricalSourceJson(value: unknown, indent?: number): string {
  return JSON.stringify(
    value,
    (_key, entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;

      const object = entry as Record<string, unknown>;

      return Object.fromEntries(
        Object.keys(object)
          .sort()
          .map((key) => [key, object[key]]),
      );
    },
    indent,
  );
}
