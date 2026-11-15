import { Matrix3, Matrix4 } from 'three';
import { toScene } from '../agent/agentFrame';
import { generatedHoles } from '../agent/cadHoles';
import { portsOf, worldPort, type WorldPort } from '../agent/ports';
import { sheetPorts } from '../agent/sheetPorts';
import type { ChainResult, FastenerChain } from '../assembly/assemblyTypes';
import { fastenerSpec } from '../assembly/fastenerSpec';
import { THREAD } from '../data/hardware';
import type { LightenFrozen } from '../strength/lightenTypes';
import type { ScrewLine, V3 } from '../strength/types';
import type { MeshMeasure } from '../three/meshMeasure';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';

const axes = [0, 1, 2];
const sourcePorts = (part: ScenePart) => portsOf({ ...part, sheetTransform: undefined });

function scaleOf(part: ScenePart): number[] {
  const size = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];

  return size.map((value, axis) => (part.cad ? value / part.cad.baseSize[axis] : 1));
}

function portAt(part: ScenePart, port: Port): WorldPort {
  const scale = scaleOf(part);
  const position = port.position.map((value, axis) => value * scale[axis]) as V3;
  const normal = port.kind === 'face';
  const axis = port.axis.map((value, axis) => (normal ? value / scale[axis] : value * scale[axis])) as V3;

  if (Math.hypot(...axis) === 0 || [...position, ...axis].some((value) => !Number.isFinite(value)))
    throw new Error(`${part.name}: ${port.name} has no measured axis or position.`);

  const transformed = part.sheetTransform ? sheetPorts(part, [port])[0] : { ...port, position, axis };

  return worldPort(part, transformed);
}

function radiusScale(part: ScenePart): number {
  const scale = Math.max(...scaleOf(part));

  if (!part.sheetTransform) return scale;

  const linear = new Matrix3().setFromMatrix4(new Matrix4().fromArray(part.sheetTransform)).elements.map(Math.abs);
  const rows = axes.map((row) => axes.reduce((sum, col) => sum + linear[col * 3 + row], 0));
  const columns = axes.map((col) => axes.reduce((sum, row) => sum + linear[col * 3 + row], 0));

  return scale * Math.sqrt(Math.max(...rows) * Math.max(...columns));
}

function acrossBounds(at: WorldPort, measure: MeshMeasure, radius: number): ScrewLine {
  const projections = Array.from({ length: 8 }, (_, corner) =>
    axes.reduce((sum, axis) => {
      const value = corner & (1 << axis) ? measure.max[axis] : measure.min[axis];

      return sum + (value - at.position[axis]) * at.axis[axis];
    }, 0),
  );
  const endpoint = (distance: number) => at.position.map((value, axis) => value + distance * at.axis[axis]) as V3;

  return { from: endpoint(Math.min(...projections)), to: endpoint(Math.max(...projections)), radius };
}

function portRadius(part: ScenePart, port: Port): number {
  const thread = port.thread ? THREAD[port.thread as keyof typeof THREAD]?.d : undefined;
  const diameter = port.diameterMm ?? thread;
  const cylindrical = ['bore', 'boss', 'hole_circle', 'screw'].includes(port.kind);

  if (cylindrical && !(diameter && diameter > 0))
    throw new Error(`${part.name}: ${port.name} needs a measured diameter before lightening.`);

  return (((diameter ?? 0) + (port.pitchDiameterMm ?? 0)) / 2) * radiusScale(part);
}

function preservePorts(part: ScenePart, measure: MeshMeasure): LightenFrozen {
  const lines: ScrewLine[] = [];
  const planes: NonNullable<LightenFrozen['planes']> = [];

  for (const port of sourcePorts(part)) {
    const at = portAt(part, port);

    if (port.kind === 'face') planes.push({ point: at.position, normal: at.axis, halfThickness: 0 });
    else lines.push(acrossBounds(at, measure, portRadius(part, port)));
  }

  return { lines, planes };
}

function touchingChain(chain: FastenerChain, part: string, chains: ChainResult): boolean {
  return (
    chain.stack.includes(part) ||
    chain.endsIn.id === part ||
    chains.sleeves.some((sleeve) => sleeve.host === part && sleeve.screw === chain.id)
  );
}

function chainRadius(chain: FastenerChain, parts: ScenePart[], chains: ChainResult): number {
  const ids = new Set([
    ...chain.stack,
    chain.endsIn.id,
    ...chains.sleeves.filter((sleeve) => sleeve.screw === chain.id).map((sleeve) => sleeve.id),
  ]);
  const radii = parts
    .filter((part) => ids.has(part.id))
    .flatMap((part) => {
      const spec = fastenerSpec(part);

      if (!spec) return [];

      const radius = spec.kind === 'screw' ? spec.headR : spec.outerR;
      const delta = part.position.map((value, axis) => value - chain.tip[axis]);
      const length = Math.hypot(...chain.axis);
      const axis = chain.axis.map((value) => value / length);
      const along = delta.reduce((sum, value, k) => sum + value * axis[k], 0);
      const offset = Math.hypot(...delta.map((value, k) => value - along * axis[k]));

      return [radius + offset];
    });

  return Math.max(chain.headR, chain.d / 2, ...radii);
}

function preserveChains(options: {
  part: ScenePart;
  parts: ScenePart[];
  chains?: ChainResult | null;
  measure: MeshMeasure;
}): ScrewLine[] {
  const { part, parts, chains, measure } = options;

  if (!chains) return [];

  return chains.screws
    .filter((chain) => touchingChain(chain, part.id, chains))
    .map((chain) => {
      const at = worldPort(
        { position: [0, 0, 0], rotation: [0, 0, 0] },
        {
          name: chain.id,
          kind: 'screw',
          position: chain.tip,
          axis: chain.axis,
        },
      );

      return acrossBounds(at, measure, chainRadius(chain, parts, chains));
    });
}

function preserveMates(part: ScenePart, parts: ScenePart[]): NonNullable<LightenFrozen['planes']> {
  const own = new Map(sourcePorts(part).map((port) => [port.name, port]));
  const inbound = parts.flatMap((other) => (other.mates ?? []).filter((mate) => mate.target === part.id));
  const names = [...(part.mates ?? []).map((mate) => mate.port), ...inbound.map((mate) => mate.targetPort)];
  const missing = names.find((name) => !own.has(name));

  if (missing) throw new Error(`${part.name}: the ${missing} mate port is missing.`);

  const faces = new Set([
    ...(part.mates ?? []).filter((mate) => mate.type === 'face').map((mate) => mate.port),
    ...inbound.filter((mate) => mate.type === 'face').map((mate) => mate.targetPort),
  ]);

  return [...faces]
    .map((name) => own.get(name)!)
    .filter((port) => port.kind !== 'face')
    .map((port) => {
      const at = portAt(part, { ...port, kind: 'face' });

      return { point: at.position, normal: at.axis, halfThickness: 0 };
    });
}

function preserveCuts(part: ScenePart, measure: MeshMeasure): ScrewLine[] {
  if (!part.cad) return [];

  return generatedHoles(part.cad.language, part.cad.code).map((hole) => {
    const local = toScene(hole.start).map((value, axis) => value - part.cad!.originOffset[axis]) as V3;
    const at = portAt(part, { name: 'generated hole', position: local, axis: toScene(hole.direction), kind: 'bore' });
    const radius = (hole.diameter / 2) * radiusScale(part);

    return acrossBounds(at, measure, radius);
  });
}

export function frozenInterfaces(options: {
  part: ScenePart;
  parts: ScenePart[];
  chains?: ChainResult | null;
  measure: MeshMeasure;
}): LightenFrozen {
  const { part, parts, measure } = options;
  const scale = scaleOf(part);

  if (scale.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error(`${part.name}: its CAD dimensions cannot be measured.`);

  const matePlanes = preserveMates(part, parts);
  const ports = preservePorts(part, measure);

  return {
    ...ports,
    planes: [...(ports.planes ?? []), ...matePlanes],
    lines: [...(ports.lines ?? []), ...preserveChains(options), ...preserveCuts(part, measure)],
  };
}
