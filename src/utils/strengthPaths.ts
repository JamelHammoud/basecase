import type { FastenerChain } from '../assembly/assemblyTypes';
import { LAYERED } from '../strength/material';
import type { ScenePart } from '../types/robotics';
import { isPrinted, printMaterialOf } from './bom';
import { dot, norm, sub, type V3 } from './engineeringMath';
import type { CheckContext, ServoLine } from './engineeringTypes';

const HORN_REACH_MM = 12;
const PARALLEL = 0.9;
const MAX_HOPS = 3;

interface PathPart {
  part: ScenePart;
  inScrews: FastenerChain[];
  outScrews: FastenerChain[];
}

function offAxis(point: V3, line: ServoLine): number {
  const rel = sub(point, line.point);
  const a = norm(line.axis);
  const along = dot(rel, a);

  return Math.hypot(rel[0] - along * a[0], rel[1] - along * a[1], rel[2] - along * a[2]);
}

const isHornScrew = (c: FastenerChain, out: ServoLine) =>
  Math.abs(dot(norm(c.axis as V3), norm(out.axis))) > PARALLEL && offAxis(c.tip as V3, out) <= HORN_REACH_MM;

export class StrengthPaths {
  private readonly touches = new Map<FastenerChain, Set<string>>();
  private readonly byPart = new Map<string, FastenerChain[]>();
  private readonly ctx: CheckContext;

  constructor(ctx: CheckContext, chains: FastenerChain[]) {
    this.ctx = ctx;

    for (const chain of chains) {
      const parts = new Set(chain.stack);

      if (chain.endsIn.id) parts.add(chain.endsIn.id);

      this.touches.set(chain, parts);

      for (const id of parts) {
        const screws = this.byPart.get(id);

        if (screws) screws.push(chain);
        else this.byPart.set(id, [chain]);
      }
    }
  }

  from(servo: string, out: ServoLine): PathPart[] {
    const horn = (this.byPart.get(servo) ?? []).filter((c) => isHornScrew(c, out));
    const seen = new Set<string>();
    const path: PathPart[] = [];
    let frontier = this.nextHops(horn, seen);

    for (let hop = 0; hop < MAX_HOPS && frontier.size; hop++) {
      const next = new Map<string, FastenerChain[]>();

      for (const [id, inScrews] of frontier) {
        seen.add(id);

        const incoming = new Set(inScrews);
        const outScrews = (this.byPart.get(id) ?? []).filter((c) => !incoming.has(c) && this.joinsOthers(c, id));

        if (!outScrews.length) continue;

        path.push({ part: this.ctx.byPart.get(id)!, inScrews, outScrews });
        this.nextHops(outScrews, seen).forEach((screws, to) => next.set(to, [...(next.get(to) ?? []), ...screws]));
      }

      frontier = next;
    }

    return path;
  }

  private bearsLoad(p: ScenePart | undefined): p is ScenePart {
    return !!p && isPrinted(p) && !!LAYERED[printMaterialOf(p, this.ctx.project)];
  }

  private joinsOthers(c: FastenerChain, id: string): boolean {
    for (const other of this.touches.get(c)!) {
      if (other !== id && this.ctx.byPart.get(other)?.kind !== 'hardware') return true;
    }

    return false;
  }

  private nextHops(screws: FastenerChain[], seen: Set<string>): Map<string, FastenerChain[]> {
    const out = new Map<string, FastenerChain[]>();

    for (const c of screws)
      for (const id of this.touches.get(c)!) {
        if (seen.has(id) || !this.bearsLoad(this.ctx.byPart.get(id))) continue;

        out.set(id, [...(out.get(id) ?? []), c]);
      }

    return out;
  }
}
