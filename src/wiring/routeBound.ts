import { MathUtils } from 'three';
import type { PortVec } from '../types/ports';
import type { RobotJoint } from '../types/robotics';
import type { RelativeBound } from './routeCollision';
import type { RouteMotion } from './routeMotion';
import { distance } from './routeMeasure';

interface BoundJoint {
  origin: PortVec;
  prismatic: boolean;
  full: number;
  sampled: number;
  fullSine: number;
  sampledSine: number;
}

interface BoundLink extends BoundJoint {
  translations: number;
}

interface BoundPair {
  point: BoundLink[];
  obstacle: BoundLink[];
}

const sine = (half: number) => Math.sin(Math.min(Math.PI, MathUtils.degToRad(half)) / 2);

function boundJoint(joint: RobotJoint, motion: RouteMotion): BoundJoint {
  const full = Math.max(...(joint.range ?? [0]).map(Math.abs));
  const sampled = motion.halves.get(joint.id) ?? 0;

  return {
    origin: joint.origin,
    prismatic: joint.type === 'prismatic',
    full,
    sampled,
    fullSine: sine(full),
    sampledSine: sine(sampled),
  };
}

function prepareChain(chain: BoundJoint[]): BoundLink[] {
  return chain.map((joint, index) => {
    let translations = 0;

    for (let earlier = 0; earlier < index; earlier++) {
      const prior = chain[earlier];

      translations += prior.prismatic ? prior.full : 2 * distance(prior.origin, joint.origin);
    }

    return { ...joint, translations };
  });
}

function pairBound(pair: BoundPair, point: PortVec): number {
  let full = 0;
  let sampled = 0;
  let obstacle = 0;

  for (const link of pair.point) {
    const radius = distance(point, link.origin) + link.translations + 0;

    full += link.prismatic ? link.full : 2 * radius * link.fullSine;
    sampled += link.prismatic ? link.sampled : 2 * radius * link.sampledSine;
  }

  for (const link of pair.obstacle) {
    const radius = distance(point, link.origin) + link.translations + full;

    obstacle += link.prismatic ? link.sampled : 2 * radius * link.sampledSine;
  }

  return sampled + obstacle;
}

export function relativeMotionBound(motion: RouteMotion): RelativeBound {
  const joints = new Map<RobotJoint, BoundJoint>();
  const chains = new Map<string | undefined, BoundJoint[]>();
  const pairs = new Map<string | undefined, Map<string | undefined, BoundPair>>();
  const chainOf = (owner: string | undefined) => {
    const cached = chains.get(owner);

    if (cached) return cached;

    const chain = [...(owner ? (motion.rig.chain.get(owner) ?? []) : [])].map((id) => {
      const joint = motion.rig.byId.get(id)!;
      const prepared = joints.get(joint) ?? boundJoint(joint, motion);

      joints.set(joint, prepared);

      return prepared;
    });

    chains.set(owner, chain);

    return chain;
  };

  return (point, obstacleId) => {
    const pointOwner = point.obstacleId ? motion.rig.ownerOf.get(point.obstacleId) : undefined;
    const obstacleOwner = obstacleId ? motion.rig.ownerOf.get(obstacleId) : undefined;

    if (pointOwner === obstacleOwner) return 0;

    const byObstacle = pairs.get(pointOwner) ?? new Map<string | undefined, BoundPair>();
    const cached = byObstacle.get(obstacleOwner);

    if (cached) return pairBound(cached, point.position);

    const pointChain = chainOf(pointOwner);
    const obstacleChain = chainOf(obstacleOwner);
    const shared = new Set(pointChain.filter((joint) => obstacleChain.includes(joint)));
    const pair = {
      point: prepareChain(pointChain.filter((joint) => !shared.has(joint))),
      obstacle: prepareChain(obstacleChain.filter((joint) => !shared.has(joint)).reverse()),
    };

    byObstacle.set(obstacleOwner, pair);
    pairs.set(pointOwner, byObstacle);

    return pairBound(pair, point.position);
  };
}
