import { portsOf, worldPort } from '../agent/ports';
import type { PartMate } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { reflectPoint, type MirrorPlane, type V3 } from './plane';

const PORT_TOLERANCE_MM = 1;

const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface PortMatch {
  source: ScenePart;
  name: string;
  onto: ScenePart;
  plane: MirrorPlane;
}

export function matchingPort({ source, name, onto, plane }: PortMatch): string | undefined {
  const port = portsOf(source).find((p) => p.name === name);

  if (!port) return undefined;

  const want = reflectPoint(worldPort(source, port).position, plane);
  const best = portsOf(onto)
    .filter((q) => q.kind === port.kind)
    .map((q) => ({ name: q.name, off: gap(worldPort(onto, q).position, want) }))
    .sort((a, b) => a.off - b.off)[0];

  return best && best.off <= PORT_TOLERANCE_MM ? best.name : undefined;
}

export interface MateScene {
  parts: ScenePart[];
  copies: Map<string, ScenePart>;
  plane: MirrorPlane;
}

function mirrorMate(mate: PartMate, source: ScenePart, copy: ScenePart, scene: MateScene): PartMate | null {
  const targetSource = scene.parts.find((p) => p.id === mate.target);

  if (!targetSource) return null;

  const targetCopy = scene.copies.get(mate.target);
  const onto = targetCopy ?? targetSource;
  const port = matchingPort({ source, name: mate.port, onto: copy, plane: scene.plane });
  const targetPort = matchingPort({ source: targetSource, name: mate.targetPort, onto, plane: scene.plane });

  if (!port || !targetPort) return null;

  return { ...mate, port, target: onto.id, targetPort };
}

export function mirroredMates(source: ScenePart, copy: ScenePart, scene: MateScene): PartMate[] | undefined {
  const mates = (source.mates ?? []).flatMap((m) => mirrorMate(m, source, copy, scene) ?? []);

  return mates.length ? mates : undefined;
}
