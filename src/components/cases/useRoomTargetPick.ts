import { useState } from 'react';
import type { GoalKind, GoalValues } from '../../cases/caseGoals';
import type { WorldKind } from '../../cases/caseWorlds';
import { roomTargets } from '../../cases/roomTargets';
import type { CaseBuilder } from '../../workspace/useCaseBuilder';

const TARGETED: ReadonlySet<GoalKind> = new Set(['reach', 'path']);

interface Pick {
  builder: CaseBuilder;
  goal: GoalKind;
  world: WorldKind;
  values: GoalValues;
}

export function useRoomTargetPick({ builder, goal, world, values }: Pick) {
  const [picked, setPicked] = useState<Array<string | null>>([]);
  const targets =
    world === 'room' && builder.room && TARGETED.has(goal) ? roomTargets(builder.room, builder.robot) : [];
  const count = goal === 'path' ? Math.round(values.stops) : 1;

  return {
    targets,
    count,
    chosen: targets.length ? picked.slice(0, count) : [],
    pick: (index: number, target: string | null) =>
      setPicked((p) =>
        Array.from({ length: Math.max(p.length, index + 1) }, (_, i) => (i === index ? target : (p[i] ?? null))),
      ),
    clear: () => setPicked([]),
  };
}
