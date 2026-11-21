import { expect, it } from 'vitest';
import { selfContactArmInput } from '../sim/fixtures/selfContactArm';
import { placedRobot, placementOf, robotPivot } from './slots';
import { buildRig } from '../utils/kinematics';
import { castJoined } from './caseCast';
import { withGuests } from '../sim/simGuests';
import { caseRobotOf } from './caseCheckJob';
import { buildMjcf, type MjcfInput } from '../sim/mjcf';

it('preserves enabled settings and declared pairs through slot placement, joining and worker transport', () => {
  const input = selfContactArmInput(true, [['base', 'tip']]);
  const source = { parts: input.parts, joints: input.rig.joints, selfContact: input.project.selfContact };
  const place = placementOf({ id: 'partner', pose: { position: [400, 100, 0], yawDeg: 30 } }, robotPivot(source));
  const guest = placedRobot(source, place);
  const rig = buildRig(guest.joints, guest.parts);
  const key = rig.robots[0].key;

  expect(guest.selfContact?.[key]).toEqual({ enabled: true, exclusions: [['partner.base', 'partner.tip']] });

  const joined = castJoined({ ...source, selfContact: {} }, [
    { robot: source, place, slot: { id: 'partner', needs: [], binding: {} } },
  ]);
  const own: MjcfInput = { ...input, project: { ...input.project, selfContact: {} } };
  const live = withGuests(own, joined);
  const wire = caseRobotOf({ id: 'partner', ...guest, measures: {}, triangles: {} });

  expect(live.project.selfContact?.[key]?.enabled).toBe(true);
  expect(wire.selfContact).toEqual(guest.selfContact);
  expect(buildMjcf(live).robots.find((robot) => robot.key === key)?.fingerprint).toBeDefined();
});
