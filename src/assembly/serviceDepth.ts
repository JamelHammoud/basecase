import { COMPONENT_BY_ID, type ComponentGroup } from '../data/components';
import type { ScenePart } from '../types/robotics';
import type { AssemblyGeometry } from './assemblyGeometry';

export type ServiceClass = 'battery' | 'electronics' | 'servo';

export const SERVICE_TARGET_STEPS: Record<ServiceClass, number> = { battery: 2, electronics: 5, servo: 10 };

const MAX_DEPTH = 60;

const CLASS_BY_GROUP: Partial<Record<ComponentGroup, ServiceClass>> = {
  Computers: 'electronics',
  Microcontrollers: 'electronics',
  Drivers: 'electronics',
  Servos: 'servo',
  Motors: 'servo',
};

export function serviceClass(p: ScenePart): ServiceClass | null {
  const info = p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined;

  if (info?.battery || /batter/i.test(p.supplyId ?? '')) return 'battery';

  if (info?.regulator) return 'electronics';

  return info ? (CLASS_BY_GROUP[info.group] ?? null) : null;
}

export interface ServiceResult {
  id: string;
  cls: ServiceClass;
  steps: number | null;
  partsOut: string[];
  screwsOut: string[];
  blockedBy: string[];
}

interface Search {
  g: AssemblyGeometry;
  memo: Map<string, Set<string> | null>;
  visiting: Set<string>;
  pins: Map<string, string[]>;
}

function pinsOf(g: AssemblyGeometry): Map<string, string[]> {
  const out = new Map<string, string[]>();

  for (const c of g.chains.screws) for (const id of c.stack) out.set(id, [...(out.get(id) ?? []), c.id]);

  return out;
}

function mergeAll(s: Search, out: Set<string>, ids: string[]): boolean {
  for (const b of ids) {
    if (out.has(b)) continue;

    const sub = need(s, b);

    if (!sub) return false;

    sub.forEach((x) => out.add(x));
  }

  return true;
}

function firstWay(s: Search, out: Set<string>, ways: string[][]): boolean {
  return ways.some((way) => {
    const before = new Set(out);
    const fine = mergeAll(s, out, way);

    if (!fine) {
      out.clear();
      before.forEach((x) => out.add(x));
    }

    return fine;
  });
}

const tracked = (s: Search, id: string) => !!s.g.moves[id] || !!s.g.drivers[id];

function waysOut(s: Search, id: string): string[][] {
  const drivers = s.g.drivers[id];

  if (drivers) return drivers.map((o) => o.blockers.filter((b) => tracked(s, b)));

  const m = s.g.moves[id];

  return (m.exit ?? m.local).map((b) => b.filter((x) => x !== id && tracked(s, x)));
}

function need(s: Search, id: string): Set<string> | null {
  if (s.memo.has(id)) return s.memo.get(id)!;

  if (s.visiting.has(id) || s.visiting.size > MAX_DEPTH || !tracked(s, id)) return null;

  s.visiting.add(id);

  const out = new Set([id]);
  const ways = waysOut(s, id).sort((a, b) => a.length - b.length);
  const ok = mergeAll(s, out, s.pins.get(id) ?? []) && firstWay(s, out, ways);

  s.visiting.delete(id);
  s.memo.set(id, ok ? out : null);

  return ok ? out : null;
}

function nearestBlockers(g: AssemblyGeometry, id: string): string[] {
  const m = g.moves[id];

  return [...(m.exit ?? m.local)].sort((a, b) => a.length - b.length)[0]?.filter((x) => g.moves[x]) ?? [];
}

export function serviceDepths(
  parts: ScenePart[],
  g: AssemblyGeometry,
  toolOf: (id: string) => string,
): ServiceResult[] {
  const search: Search = { g, memo: new Map(), visiting: new Set(), pins: pinsOf(g) };

  return parts.flatMap((p) => {
    const cls = serviceClass(p);

    if (!cls || !g.moves[p.id]) return [];

    const set = need(search, p.id);
    const partsOut = set ? [...set].filter((x) => x !== p.id && g.moves[x]) : [];
    const screwsOut = set ? [...set].filter((x) => g.drivers[x]) : [];
    const tools = new Set(screwsOut.map(toolOf));

    return [
      {
        id: p.id,
        cls,
        steps: set ? partsOut.length + 1 + tools.size : null,
        partsOut,
        screwsOut,
        blockedBy: set ? [] : nearestBlockers(g, p.id),
      },
    ];
  });
}
