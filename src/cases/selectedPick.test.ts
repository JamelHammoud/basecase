import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import { stageCase } from './caseCast';
import { parseCase, worldItem } from './schema';
import { scaledToReach } from './scale';
import { selectedPickTargets } from './selectedPick.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { projectFingerprint } from '../workspace/runReadiness';
import { resolvePrinter } from '../data/printers';

const robot = () => fixtureRobots().find((r) => r.id === 'arm-6dof')!;

function selectedCase(target: ScenePart) {
  const arm = robot();
  const rig = buildRig(arm.joints, arm.parts);
  const spec: CaseSpec = { goal: 'pick', world: 'floor', pickTarget: target };
  const built = buildCase(spec, builderRobot(rig, arm.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

function trace(): Trace {
  const signals: Trace['signals'] = { grip: [], contact: [], lift: [], spot: [] };

  for (let frame = 0; frame < 100; frame++) {
    signals.grip.push(frame >= 10 && frame < 75 ? 1 : 0);
    signals.contact.push(frame >= 10 && frame < 75 ? 1 : 0);
    signals.lift.push(frame >= 30 && frame < 65 ? 50 : 0);
    signals.spot.push(frame < 65 ? 100 : 0);
  }

  return { dt: 0.02, signals };
}

describe('selected-object pick', () => {
  it('retains exact geometry, identity and supplied physics across staging and JSON reopening for ten targets', () => {
    const arm = robot();
    const rig = buildRig(arm.joints, arm.parts);

    for (const target of selectedPickTargets()) {
      const kase = selectedCase(target);
      const reopened = parseCase(JSON.parse(JSON.stringify(kase)));
      const staged = stageCase(reopened, { rig, parts: arm.parts }, []);

      for (const candidate of [kase, reopened, staged.kase, scaledToReach(reopened, 100, [50, 20, 0])]) {
        const object = candidate.world.objects.find((item) => item.id === target.id)!;
        const item = worldItem(object);

        expect(candidate.world.pickTarget).toBe(target.id);
        expect(item).toMatchObject({
          id: target.id,
          kind: target.kind,
          position: target.position,
          rotation: target.rotation,
          dimensions: target.dimensions,
          massG: target.massG,
          physics: target.physics,
        });
        expect(object.geometry).toEqual(target);
        expect(object.massSource).toBe('supplied');
        expect(candidate.reference).toEqual(kase.reference);
        expect(candidate.task).toEqual(kase.task);
      }
    }
  });

  it('keeps the generated-block path for callers without a selected object', () => {
    const arm = robot();
    const made = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

    expect(made.ok && made.kase.world.pickTarget).toBeUndefined();
    expect(made.ok && made.kase.world.objects[0]).toMatchObject({ id: 'block', size: [35, 35, 35] });
  });

  it('requires both-jaw lifting, continuous retention until placement and a released final target', async () => {
    const kase = selectedCase(selectedPickTargets()[0]);
    const contract = kase.task.contract;
    const positive = trace();

    expect((await evaluateContract(contract, positive)).passed).toBe(true);

    for (const failure of ['palm', 'one-jaw', 'push', 'drop', 'held', 'raised-placement']) {
      const negative = trace();

      if (failure === 'palm' || failure === 'one-jaw') negative.signals.grip.fill(0);

      if (failure === 'push') negative.signals.lift.fill(0);

      if (failure === 'drop') negative.signals.grip.fill(0, 45, 65);

      if (failure === 'held') negative.signals.contact.fill(1, 75);

      if (failure === 'raised-placement') negative.signals.lift.fill(50, 65);

      expect((await evaluateContract(contract, negative)).passed, failure).toBe(false);
    }
  });

  it('refuses unsupported geometry, missing physics, oversized targets and insufficient jaw travel without source changes', () => {
    const arm = robot();
    const builder = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);
    const source = JSON.stringify(arm);
    const target = selectedPickTargets()[0];
    const failures: ScenePart[] = [
      { ...target, kind: 'sphere' },
      { ...target, massG: undefined },
      { ...target, massG: -1 },
      { ...target, physics: { dynamic: true } },
      { ...target, physics: { dynamic: true, friction: -1 } },
      { ...target, dimensions: { width: 80, height: 20, depth: 20 } },
      { ...target, rotation: [NaN, 0, 0] },
    ];

    for (const pickTarget of failures) {
      expect(buildCase({ goal: 'pick', world: 'floor', pickTarget }, builder).ok).toBe(false);
    }

    expect(JSON.stringify(arm)).toBe(source);

    const limited = {
      ...arm,
      joints: arm.joints.map((joint) =>
        joint.id.startsWith('finger_') ? { ...joint, range: [-2, 2] as [number, number] } : joint,
      ),
    };

    expect(
      buildCase(
        { goal: 'pick', world: 'floor', pickTarget: target },
        builderRobot(buildRig(limited.joints, limited.parts), limited.parts),
      ).ok,
    ).toBe(false);
  });

  it('refuses a selected target that aliases a robot part or is supplied to another goal', () => {
    const arm = robot();
    const builder = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);
    const target = selectedPickTargets()[0];

    expect(buildCase({ goal: 'touch', world: 'floor', pickTarget: target }, builder).ok).toBe(false);
    expect(buildCase({ goal: 'pick', world: 'floor', pickTarget: { ...target, id: 'palm' } }, builder).ok).toBe(false);
  });

  it('validates the selected-object reference on reopen and keeps its declared friction in the Case fingerprint', () => {
    const target = selectedPickTargets()[0];
    const kase = selectedCase(target);
    const changed = selectedCase({ ...target, physics: { dynamic: true, friction: 0.2 } });

    const arm = robot();
    const fingerprint = (candidate: typeof kase) =>
      projectFingerprint(
        arm.parts,
        { ...DEFAULT_PROJECT, joints: arm.joints, cases: [candidate] },
        resolvePrinter('default', []),
        { purchases: {}, money: { code: 'USD', ratesDate: '2026-11-20' } },
      );

    expect(fingerprint(changed)).not.toBe(fingerprint(kase));
    expect(() => parseCase({ ...kase, world: { ...kase.world, pickTarget: 'missing' } })).toThrow();
    expect(() => parseCase({ ...kase, world: { ...kase.world, pickTarget: 'spot' } })).toThrow();

    for (const tampered of [{ massG: 20 }, { friction: 0.2 }, { size: [22, 20, 20] }]) {
      const world = {
        ...kase.world,
        objects: kase.world.objects.map((object) => (object.id === target.id ? { ...object, ...tampered } : object)),
      };

      expect(() => parseCase({ ...kase, world })).toThrow();
    }
  });
});
