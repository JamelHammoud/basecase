import type { Net, WiringRouteSpec } from './connectors';

const routeKey = (
  fromId: string | null,
  fromPort: string | undefined,
  toId: string | null,
  toPort: string | undefined,
) => JSON.stringify([fromId, fromPort, toId, toPort]);

export function indexRouteSpecs(specs: WiringRouteSpec[] = []): (net: Net) => WiringRouteSpec | undefined {
  if (!specs.length) return () => undefined;

  const indexed = new Map<string, WiringRouteSpec>();

  for (const spec of specs) {
    const key = routeKey(spec.from.partId, spec.from.port, spec.to.partId, spec.to.port);

    if (!indexed.has(key)) indexed.set(key, spec);
  }

  return (net) => indexed.get(routeKey(net.from.id, net.from.port?.name, net.to.id, net.to.port?.name));
}
