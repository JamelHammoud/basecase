import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateContract } from '../skills/contract';
import { SimEngine } from '../sim/engine';
import { Recorder } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { personEncounterFixture, PERSON_ENCOUNTERS } from './personEncounters.fixtures';
import { runCase } from './testing';
import { scoreTry, tryManifest, trySignals } from './tries';
import { robotFacts } from './robotFit';
import { replacePerson } from './personAuthoring';
import { LiveCase } from './liveCase';
import { commandTimeline, stepScriptedCase } from '../sim/simRun';
import { replayTry } from './tryReplay';
import { personAt, preparePerson } from './personEncounter';
import { toMj } from '../sim/mjcfFrames';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

const references = new Map<number, ReturnType<typeof recordedReference>>();

async function recordedReference(index: number) {
  const { kase, robot } = personEncounterFixture(index);
  const result = await runCase(mj, kase, robot, { controller: 'reference', record: true });
  const rig = buildRig(robot.joints, robot.parts);

  return {
    robot,
    result,
    source: {
      kase: result.case,
      model: result.model,
      recording: result.recording!,
      rig,
      effector: robotFacts(rig, robot.parts).endEffector,
    },
  };
}

function reference(index: number) {
  const saved = references.get(index) ?? recordedReference(index);

  references.set(index, saved);

  return saved;
}

it('restarts delayed person routes for successive live tries on an already running simulation', async () => {
  const { source, robot } = await reference(0);
  const engine = new SimEngine(mj, source.model);
  const person = source.kase.world.objects.find((object) => object.person)!;
  const body = source.model.bodies.find((item) => item.moves?.person)!;
  const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name);
  const mocap = engine.model.body_mocapid[id];
  const at = () => Array.from(engine.data.mocap_pos.subarray(mocap * 3, mocap * 3 + 3));
  const expected = (seconds: number) => toMj(personAt(preparePerson(person.person!), seconds));
  const samePosition = (seconds: number) =>
    at().forEach((value, axis) => expect(value).toBeCloseTo(expected(seconds)[axis], 8));

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      engine.step(8);

      const live = await LiveCase.start(
        engine,
        { kase: source.kase, plan: null, joints: robot.joints, kit: null },
        () => ({ kind: 'limp' }),
      );

      samePosition(0);
      live.advance(0.1);
      samePosition(0.1);
      live.advance(0.9);
      samePosition(1);
    }

    engine.reset();
    engine.step(1);
    samePosition(1);
  } finally {
    engine.dispose();
  }
});

for (const [index, name] of PERSON_ENCOUNTERS.entries()) {
  describe(name, () => {
    it('keeps reference success, physical replay and exact Case identity', async () => {
      const { result, source } = await reference(index);

      expect(result.passed).toBe(true);
      expect((await scoreTry(source)).passed).toBe(true);

      const replayed = await replayTry(mj, source, null);

      expect(replayed.passed).toBe(true);
      assertBytes(replayed.recording.poses, source.recording.poses);
      assertBytes(replayed.recording.contacts!, source.recording.contacts!);
      assertBytes(replayed.recording.contactOffsets!, source.recording.contactOffsets!);

      const object = source.kase.world.objects.find((item) => item.person)!;
      const originalManifest = await tryManifest(source.kase, source.model, source.recording);
      const changed = replacePerson(source.kase, {
        ...object,
        person: { ...object.person!, startSeconds: object.person!.startSeconds + 0.1 },
      });

      expect((await tryManifest(changed, source.model, source.recording)).caseHash).not.toBe(originalManifest.caseHash);
    });

    it('refuses blocked tasks, person contact and missing required observations independently', async () => {
      const { robot, source } = await reference(index);
      const kase = source.kase;
      const blocked = await runCase(mj, kase, robot, { controller: 'limp' });

      expect(blocked.passed).toBe(false);

      const object = kase.world.objects.find((item) => item.person)!;
      const y = object.position[1];
      const position: typeof object.position = [0, y, 0];
      const contactCase = replacePerson(kase, {
        ...object,
        position,
        person: {
          ...object.person!,
          startSeconds: 0,
          route: [
            { position, pauseSeconds: 1 },
            { position: [1000, y, 0], pauseSeconds: 0 },
          ],
        },
      });
      const contact = await runCase(mj, contactCase, robot, { controller: 'reference' });

      expect(contact.passed).toBe(false);
      expect(contact.failed).toContain(`Contact with ${object.name}`);

      const missing = evaluateContract(
        {
          ...kase.task.contract,
          success: {
            all: [
              kase.task.contract.success,
              {
                eventually: {
                  window: 'whole',
                  state: { atom: { expr: { signal: 'required-observation' }, cmp: '>', value: 0.5, scale: 1 } },
                },
              },
            ],
          },
        },
        trySignals(source),
      );

      await expect(missing).rejects.toThrow('The trace has no signal named required-observation');
    });

    it.each([0.02, 0.08])(
      'keeps exact live poses, contacts, timestamps and verdicts with %s rendering batches',
      async (batch) => {
        const { source, robot } = await reference(index);

        await assertLive(source, robot, batch);
      },
    );
  });
}

async function assertLive(
  source: Parameters<typeof scoreTry>[0],
  robot: ReturnType<typeof personEncounterFixture>['robot'],
  batch: number,
) {
  const engine = new SimEngine(mj, source.model);
  const controller = source.recording.controller!;
  const live = await LiveCase.start(
    engine,
    { kase: source.kase, plan: null, joints: robot.joints, kit: null },
    () => controller,
  );
  const recorder = new Recorder(engine, controller);
  const script = {
    start: 0,
    commands: commandTimeline(engine, source.recording.commands!),
  };

  engine.setController(controller);
  engine.stepHook = recorder.hook;

  try {
    while (engine.data.time + 1e-9 < source.kase.task.seconds) stepScriptedCase(engine, live, script, batch);

    const recording = recorder.finish();

    expect((await scoreTry({ ...source, recording })).passed).toBe(true);

    assertBytes(recording.poses, source.recording.poses);
    assertBytes(recording.contacts!, source.recording.contacts!);
    assertBytes(recording.contactOffsets!, source.recording.contactOffsets!);
    assertBytes(recording.t, source.recording.t);
  } finally {
    engine.dispose();
  }
}

function assertBytes(actual: ArrayBufferView, expected: ArrayBufferView) {
  const a = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
  const b = Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength);

  expect(actual.byteLength).toBe(expected.byteLength);
  expect(a.equals(b)).toBe(true);
}
