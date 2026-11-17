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

export function checkElectricalSize(files: Record<string, string>, maxBytes: number) {
  if (!Number.isFinite(maxBytes)) return;

  let bytes = 0;

  for (const text of Object.values(files)) {
    if (text.length + bytes > maxBytes) throw new Error('Kit export exceeds 256 MB.');

    for (const character of text) {
      const point = character.codePointAt(0)!;

      bytes += utf8Width(point);
    }

    if (bytes > maxBytes) throw new Error('Kit export exceeds 256 MB.');
  }
}

function utf8Width(point: number) {
  if (point < 0x80) return 1;

  if (point < 0x800) return 2;

  return point < 0x10000 ? 3 : 4;
}
