import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { fixtureRobot, modelOf } from '../skills/fixtureModels';
import { loadKitLibrary } from './kitLibrary';
import { scriptedDrive } from './physicsDrive';
import { kitForModel, proveHandoff } from './physicsKit';
import { PROOF_SEEDS, Prover, type PairRun } from './physicsProver';
import { pairStamp } from './skillStamps';

const runKey = (args: Parameters<Prover['run']>) => {
  const [from, to, switchAt, moves = {}] = args;

  return JSON.stringify({ from, to, phases: Array.from({ length: PROOF_SEEDS }, (_, i) => switchAt(i + 1)), moves });
};

it('gives the Kit’s own pairs the proofs the Kit records', { timeout: 120_000 }, async () => {
  const [mj, skills] = await Promise.all([loadMujoco(), loadKitLibrary()]);
  const robot = fixtureRobot('quad-servo');
  const model = modelOf(robot);
  const scene = { mj, model, joints: robot.joints, skills, drive: scriptedDrive(model, robot.joints, robot.parts) };
  const recorded = new Map<string, PairRun>();
  const realRun = Prover.prototype.run;
  let replayOnly = false;
  const spy = vi.spyOn(Prover.prototype, 'run').mockImplementation(
    new Proxy(realRun, {
      apply(target, prover: Prover, args: Parameters<Prover['run']>) {
        const key = runKey(args);

        if (replayOnly) {
          expect(recorded.has(key)).toBe(true);

          return recorded.get(key)!;
        }

        const result = target.apply(prover, args);

        recorded.set(key, result);

        return result;
      },
    }),
  );

  try {
    const kit = kitForModel(scene);

    replayOnly = true;

    const kitProof = (from: string, to: string) => ({
      seeds: 8,
      falls: 0,
      failures: 0,
      modelHash: kit.modelHash,
      skills: pairStamp(scene, { from, to }),
    });

    for (const skill of kit.skills.filter((s) => s.status === 'ready')) {
      for (const [to, proof] of Object.entries(skill.transitions))
        expect(proveHandoff(scene, { from: skill.id, to })).toEqual(proof);
    }

    expect(kit.skills.map((s) => [s.id, s.transitions])).toEqual([
      ['walk', { settle: kitProof('walk', 'settle') }],
      [
        'settle',
        { walk: kitProof('settle', 'walk'), 'turn-away': expect.objectContaining({ seeds: 8, falls: 0, failures: 8 }) },
      ],
      ['turn-away', { walk: kitProof('turn-away', 'walk'), settle: kitProof('turn-away', 'settle') }],
      ['look-at', {}],
    ]);
  } finally {
    spy.mockRestore();
  }
});
