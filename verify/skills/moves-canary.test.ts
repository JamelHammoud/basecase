import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runArena } from '../../src/skills/arena';
import { caseModel, moveCases } from '../../src/skills/moveCases';
import { moveEnvironment, moveProblems } from '../../src/skills/moveEnvironment';

const LEGGED_CASES = 6;

function setUp(ready: boolean, why: string) {
  if (!ready) throw new Error(`The planted fault wasn't set up: ${why}`);
}

describe('Stage 3b canaries: the move contracts reject a do-nothing policy', () => {
  it('canary zero: a zero policy passes a move contract', async () => {
    const mj = await loadMujoco();
    const legged = moveCases()
      .filter((c) => c.expect === 'tracking')
      .map((c) => {
        const model = caseModel(c);

        return { model, environment: moveEnvironment(model, c.animation) };
      });
    const judged = legged.every(({ model, environment }) => moveProblems(model, environment.reference!).length === 0);

    setUp(legged.length === LEGGED_CASES && judged, 'the legged move cases are missing or too small to judge');

    const passed: boolean[] = [];

    for (const { model, environment } of legged) {
      const controller = { kind: 'hold' as const };
      const evidence = await runArena({ mj, model, contract: environment.contract, controller, environment });

      passed.push(evidence.passed);
    }

    expect(passed.some(Boolean)).toBe(true);
  }, 1_200_000);
});
