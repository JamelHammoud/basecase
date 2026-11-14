import { describe, expect, it } from 'vitest';
import {
  biped,
  mountRequest,
  offsetMount,
  rolledView,
  sceneView,
  shieldedArm,
  SIX_JOINT_ARM,
  TWO_JOINT_ARM,
  WRIST_ROLL_ARM,
} from './mountSearch.fixtures';
import { COUNTS_PER_TURN, DEFAULT_MOUNT, findMounts, type MountResult } from './mountSearch';

const byJoint = (results: MountResult[]) => Object.fromEntries(results.map((r) => [r.jointId, r]));

const zeroErrorDeg = (result: MountResult, planted: number) =>
  (Math.abs(result.mount.zeroCounts - offsetMount(planted).zeroCounts) * 360) / COUNTS_PER_TURN;

const reversed = offsetMount(0, -1);

describe('finding each joint’s zero and direction from a camera', () => {
  it('finds a reversed joint on a two-joint arm', () => {
    const found = byJoint(
      findMounts(mountRequest({ robot: TWO_JOINT_ARM, view: sceneView(TWO_JOINT_ARM), planted: { j2: reversed } })),
    );

    expect(found.j2).toMatchObject({ verdict: 'measured', mount: { zeroCounts: 2048, direction: -1 } });
    expect(found.j1).toMatchObject({ verdict: 'consistent', mount: DEFAULT_MOUNT });
  });

  it('finds a 12° horn offset within 2°', () => {
    const found = byJoint(
      findMounts(
        mountRequest({ robot: TWO_JOINT_ARM, view: sceneView(TWO_JOINT_ARM), planted: { j1: offsetMount(12) } }),
      ),
    );

    expect(found.j1.verdict).toBe('measured');
    expect(found.j1.mount.direction).toBe(1);
    expect(zeroErrorDeg(found.j1, 12)).toBeLessThan(2);
    expect(found.j2.mount).toEqual(DEFAULT_MOUNT);
  });

  it('finds an offset and a reversal planted on one joint', () => {
    const found = byJoint(
      findMounts(
        mountRequest({ robot: TWO_JOINT_ARM, view: sceneView(TWO_JOINT_ARM), planted: { j1: offsetMount(-9, -1) } }),
      ),
    );

    expect(found.j1.mount.direction).toBe(-1);
    expect(zeroErrorDeg(found.j1, -9)).toBeLessThan(2);
  });

  it('finds three planted joints of six and leaves the rest', () => {
    const planted = { j2: offsetMount(10), j4: reversed, j5: offsetMount(-14, -1) };
    const started = performance.now();
    const found = byJoint(findMounts(mountRequest({ robot: SIX_JOINT_ARM, view: sceneView(SIX_JOINT_ARM), planted })));
    const seconds = (performance.now() - started) / 1000;

    expect(seconds).toBeLessThan(10);
    expect(zeroErrorDeg(found.j2, 10)).toBeLessThan(2);
    expect(found.j4.mount.direction).toBe(-1);
    expect(found.j5.mount.direction).toBe(-1);
    expect(zeroErrorDeg(found.j5, -14)).toBeLessThan(2);

    for (const id of ['j1', 'j3', 'j6']) expect(found[id].mount).toEqual(DEFAULT_MOUNT);
  });

  it('tells a biped’s mirrored knees apart', () => {
    const robot = biped();
    const found = byJoint(
      findMounts(mountRequest({ robot, view: sceneView(robot), planted: { 'right-knee': reversed } })),
    );

    expect(found['right-knee'].mount.direction).toBe(-1);
    expect(found['left-knee'].mount).toEqual(DEFAULT_MOUNT);
  });

  it('can’t tell a joint the body hides from the camera', () => {
    const robot = shieldedArm();
    const found = byJoint(findMounts(mountRequest({ robot, view: robot.view, planted: { j2: reversed } })));

    expect(found.j2).toMatchObject({ verdict: 'cant-tell', mount: DEFAULT_MOUNT });
  });

  it('can’t tell a wrist roll that leaves the silhouette alone', () => {
    const found = byJoint(
      findMounts(
        mountRequest({ robot: WRIST_ROLL_ARM, view: sceneView(WRIST_ROLL_ARM), planted: { j2: offsetMount(8, -1) } }),
      ),
    );

    expect(found.j2).toMatchObject({ verdict: 'cant-tell', mount: DEFAULT_MOUNT });
  });

  it('finds a reversed joint through a camera rolled 30°', () => {
    const view = rolledView(sceneView(TWO_JOINT_ARM), 30);
    const found = byJoint(findMounts(mountRequest({ robot: TWO_JOINT_ARM, view, planted: { j2: reversed } })));

    expect(found.j2.mount).toEqual({ zeroCounts: 2048, direction: -1 });
  });

  it('changes nothing when nothing is planted', () => {
    const found = findMounts(mountRequest({ robot: SIX_JOINT_ARM, view: sceneView(SIX_JOINT_ARM) }));

    expect(found.every((r) => r.verdict !== 'measured')).toBe(true);
    expect(found.map((r) => r.mount)).toEqual(found.map(() => DEFAULT_MOUNT));
  });

  it('gives the same result for the same frames', () => {
    const request = mountRequest({
      robot: TWO_JOINT_ARM,
      view: sceneView(TWO_JOINT_ARM),
      planted: { j1: offsetMount(5) },
    });

    expect(findMounts(request)).toEqual(findMounts(request));
  });
});
