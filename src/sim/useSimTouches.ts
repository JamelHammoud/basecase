import { quatToMj, toMj, type SimModel } from './mjcf';
import type { SimRequest } from './sim.worker';
import type { Simulation } from './useSimulation';

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

function pushRequest(m: SimModel | null, robot: string | undefined): SimRequest | null {
  const key = robot ?? m?.robots.find((r) => r.floating)?.key ?? m?.robots[0]?.key;

  if (!m || !key) return null;

  const n = (m.massKg[key] || 1) * 9.81 * 0.5;
  const a = Math.random() * Math.PI * 2;

  return { type: 'push', robot: key, force: [Math.cos(a) * n, 0, Math.sin(a) * n] };
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
    push: (robot) => {
      const msg = pushRequest(modelRef.current, robot);

      if (msg) send(msg);
    },
  };
}
