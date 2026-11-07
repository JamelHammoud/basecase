import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { trainKitEntry } from '../../src/skills/motorKit';
import { forgeRunner } from './forge';
import { clearKitOut, kitTimeout, kitTitle, trainAndJudge } from './kit';
import { KIT_OUT, KIT_PLANS, skillStore } from './plans';

describe('Motor Kit on quad-servo', () => {
  beforeAll(() => clearKitOut('quad-servo'));

  for (const plan of KIT_PLANS['quad-servo'])
    it(
      kitTitle(plan),
      async () => expect(await trainAndJudge('quad-servo', plan)).toMatch(/^[0-9a-f]{64}$/),
      kitTimeout(plan),
    );
});

describe('Motor Kit on must-fail-weak-quad', () => {
  it('refuses Stand honestly, names servos ×2, and spends no training', async () => {
    const mj = await loadMujoco();
    const dir = path.join(KIT_OUT, 'must-fail-weak-quad');
    const forge = forgeRunner(path.join(dir, 'runs'));
    const store = skillStore(path.join(dir, 'store'));
    const outcome = await trainKitEntry({
      mj,
      design: 'must-fail-weak-quad',
      model: fixtureModel('must-fail-weak-quad'),
      entry: 'stand',
      forge: forge.run,
      save: store.save,
    });

    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.relaxation?.change).toBe('torque-x2');
    expect(outcome.kind === 'refused' && outcome.reason).toMatch(/torque|servo|weak/i);
    expect(forge.records).toHaveLength(0);
    expect(store.saved.size).toBe(0);
  }, 120_000);
});
