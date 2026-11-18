import type { SimBody } from './mjcfTypes';

export interface SelfContactSetting {
  enabled: boolean;
  exclusions?: [string, string][];
}

export type SelfContactSettings = Record<string, SelfContactSetting>;

export function activeContactSettings(settings: SelfContactSettings | undefined): SelfContactSettings | undefined {
  const entries = Object.entries(settings ?? {})
    .filter(([, setting]) => setting.enabled)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) return undefined;

  return Object.fromEntries(
    entries.map(([key, setting]) => [
      key,
      {
        enabled: true,
        exclusions: setting.exclusions
          ?.map(([a, b]) => [a, b].sort() as [string, string])
          .sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d)),
      },
    ]),
  );
}

export interface ContactTopology {
  config?: SelfContactSettings;
  movable: Set<string>;
  closures?: [string, string][];
}

export function selfContactPairs(bodies: SimBody[], topology: ContactTopology): [SimBody, SimBody][] {
  const { movable, closures = [] } = topology;
  const byName = new Map(bodies.map((body) => [body.name, body]));
  const assembly = (body: SimBody): string => {
    let current = body;

    while (current.parent && (!current.joint || !movable.has(current.joint))) {
      const parent = byName.get(current.parent);

      if (!parent) break;

      current = parent;
    }

    return current.name;
  };
  const groups = new Map(bodies.map((body) => [body.name, assembly(body)]));
  const adjacent = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');

  for (const body of bodies) {
    if (body.parent) adjacent.add(pairKey(groups.get(body.name)!, groups.get(body.parent)!));
  }

  for (const [first, second] of closures) {
    if (groups.has(first) && groups.has(second)) adjacent.add(pairKey(groups.get(first)!, groups.get(second)!));
  }

  return bodies.flatMap((body, index) =>
    bodies
      .slice(index + 1)
      .filter((other) => {
        const first = groups.get(body.name)!;
        const second = groups.get(other.name)!;

        return first === second || adjacent.has(pairKey(first, second));
      })
      .map((other) => [body, other] as [SimBody, SimBody]),
  );
}

export function declaredContactPairs(bodies: SimBody[], setting: SelfContactSetting): [SimBody, SimBody][] {
  if (bodies.length > 128 || (setting.exclusions?.length ?? 0) > 256)
    throw new Error('Self-contact supports up to 128 links and 256 excluded pairs per robot.');

  const byPart = new Map(bodies.flatMap((body) => body.parts.map((id) => [id, body] as const)));

  return (setting.exclusions ?? []).map(([first, second]) => {
    const a = byPart.get(first);
    const b = byPart.get(second);

    if (!a || !b || a === b)
      throw new Error('Choose two parts on different links of this robot for a contact exclusion.');

    return bodies.indexOf(a) < bodies.indexOf(b) ? [a, b] : [b, a];
  });
}
