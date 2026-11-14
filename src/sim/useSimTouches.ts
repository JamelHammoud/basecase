import { quatToMj, toMj, type SimModel } from './mjcf';
import type { SimRequest } from './sim.worker';
import type { Simulation } from './useSimulation';
import { FALL_PUSH, fallForce } from './fallRuns';
import { pushRequest as nudgeRequest } from './push';

type GrabHand = Parameters<Simulation['grab']>[1];

function grabRequest(
  m: SimModel,
  partIds: string[],
  hand: GrabHand,
  phase: 'start' | 'move' | 'end',
): SimRequest | null {
  if (phase === 'end' || !hand) return { type: 'grab', phase: 'end' };

  if (phase === 'start') {
    const body = m.bodies.findIndex((b) => b.parts.some((id) => partIds.includes(id)));

    return body >= 0 ? { type: 'grab', phase: 'start', body, point: toMj(hand.position) } : null;
  }

  return { type: 'grab', phase: 'move', point: toMj(hand.position), turn: hand.turn ? quatToMj(hand.turn) : null };
}

function pushRequest(m: SimModel | null, robot: string | undefined, fallDeg?: number): SimRequest | null {
  if (fallDeg === undefined) return nudgeRequest(m, robot, Math.random() * Math.PI * 2);

  const key = robot ?? m?.robots.find((r) => r.floating)?.key ?? m?.robots[0]?.key;

  if (!m || !key) return null;

  const weight = (m.massKg[key] || 1) * 9.81;
  const { seconds, releaseDeg, share } = FALL_PUSH;

  return { type: 'push', robot: key, force: fallForce(fallDeg, weight * share), seconds, releaseDeg };
}

export function useSimTouches(
  modelRef: React.RefObject<SimModel | null>,
  send: (msg: SimRequest) => void,
): Pick<Simulation, 'grab' | 'push'> {
  'use memo';

  return {
    grab: (partIds, hand, phase) => {
      const m = modelRef.current;
      const msg = m && grabRequest(m, partIds, hand, phase);

      if (msg) send(msg);
    },
    push: (robot, fallDeg) => {
      const msg = pushRequest(modelRef.current, robot, fallDeg);

      if (msg) send(msg);
    },
  };
}
