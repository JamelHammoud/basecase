import type { AssemblyGeometry, PartMoves } from './assemblyGeometry';
import type { FastenerChain } from './assemblyTypes';
import type { RemovalPlan } from './removalOrder';

export const planningMoves = (paths: string[][]): PartMoves => ({
  dirs: paths.map(() => [0, 1, 0]),
  local: paths,
  exit: paths,
  lips: paths.map(() => []),
  captured: false,
  contents: [],
});

export const planningScrew = (id: string, stack: string[]): FastenerChain => ({
  id,
  stack,
  d: 3,
  axis: [0, 1, 0],
  tip: [0, 0, 0],
  top: [0, 10, 0],
  headR: 3,
  endsIn: { kind: 'printed' },
  engagementMm: 5,
  needMm: 3,
  problems: [],
});

export function fastenerPlanningFixture(count: number) {
  const parts = Array.from({ length: count }, (_, i) => `part-${i}`);
  const screws = parts.map((_, i) => `screw-${i}`);
  let reads = 0;
  const chains = screws.map((id, i) => {
    const chain = planningScrew(id, [parts[i]]);
    const stack = chain.stack;

    Object.defineProperty(chain, 'stack', {
      get() {
        reads++;

        return stack;
      },
    });

    return chain;
  });
  const geometry: AssemblyGeometry = {
    chains: { screws: chains, sleeves: [] },
    moves: Object.fromEntries(parts.map((id, i) => [id, planningMoves([i ? [parts[i - 1]] : []])])),
    drivers: Object.fromEntries(screws.map((id) => [id, [{ tool: 'straight', blockers: [] }]])),
    splits: {},
    fits: { insertWalls: {}, leadRoomMm: {} },
    timedOut: false,
    ms: 0,
  };
  const plan: RemovalPlan = {
    steps: [
      ...screws.map((id) => ({ kind: 'screw' as const, ids: [id] })),
      ...parts.map((id) => ({ kind: 'part' as const, ids: [id] })),
    ],
    screws: Object.fromEntries(screws.map((id) => [id, { verdict: 'pass' }])),
    stuckParts: [],
  };

  return { geometry, plan, parts, screws, stackReads: () => reads };
}
