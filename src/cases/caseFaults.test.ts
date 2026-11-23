import { describe, expect, it } from 'vitest';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import {
  faultRefusal,
  faultsOf,
  missingFault,
  sameFault,
  withFault,
  withoutFault,
  withoutFaults,
  type CaseFault,
} from './caseFaults';
import { scaledToReach } from './scale';
import { CaseFileError } from './validate';
import { parseCase, type Case } from './schema';

const quad = fixtureRobots().find((r) => r.id === 'quad-servo')!;
const KNEE: CaseFault = { joint: 'leg0_bend', kind: 'limp' };

function walkCase(faults?: unknown): Case {
  const robot = builderRobot(buildRig(quad.joints, quad.parts), quad.parts);
  const made = buildCase({ goal: 'walk', world: 'floor', ...(faults === undefined ? {} : { faults }) }, robot);

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

describe('a Case’s fault list', () => {
  it('stays out of a Case that has none, so older Cases read and save as before', () => {
    const kase = walkCase();

    expect(kase).not.toHaveProperty('faults');
    expect(JSON.parse(JSON.stringify(parseCase(JSON.parse(JSON.stringify(kase)))))).toEqual(
      JSON.parse(JSON.stringify(kase)),
    );
  });

  it('parses with the Case at the same format version and reads back as written', () => {
    const kase = walkCase([KNEE, { joint: 'leg1_swing', kind: 'weak' }]);

    expect(kase.formatVersion).toBe(1);
    expect(kase.faults).toEqual([KNEE, { joint: 'leg1_swing', kind: 'weak' }]);
    expect(parseCase(JSON.parse(JSON.stringify(kase))).faults).toEqual(kase.faults);
  });

  it.each([
    ['an unknown kind', [{ joint: 'leg0_bend', kind: 'melted' }]],
    ['an actuator index', [{ joint: 3, kind: 'limp' }]],
    ['a joint that isn’t a plain id', [{ joint: 'leg 0/bend', kind: 'limp' }]],
    ['a repeated fault', [KNEE, KNEE]],
    ['a list that isn’t a list', KNEE],
    ['more than 32 entries', Array.from({ length: 33 }, (_, i) => ({ joint: `j${i}`, kind: 'limp' }))],
  ])('refuses %s', (_name, faults) => {
    expect(() => parseCase({ ...walkCase(), faults })).toThrow(CaseFileError);
  });

  it('keeps the list when the Case is scaled to a robot’s reach', () => {
    const kase = walkCase([KNEE]);

    expect(scaledToReach(kase, 400, [0, 0, 0]).faults).toEqual([KNEE]);
  });

  it('adds, removes and clears entries without touching the Case’s other fields', () => {
    const kase = walkCase();
    const added = withFault(withFault(kase, KNEE), KNEE);

    expect(faultsOf(added)).toEqual([KNEE]);
    expect(withoutFault(added, KNEE)).toEqual(kase);
    expect(withoutFaults(added)).toEqual(kase);
    expect(sameFault(KNEE, { ...KNEE, kind: 'weak' })).toBe(false);
  });

  it('refuses a joint the robot doesn’t have, or one with no servo', () => {
    const joints = [
      { id: 'a', type: 'revolute' },
      { id: 'b', type: 'fixed' },
      { id: 'c', type: 'revolute', actuation: 'passive' },
    ];

    expect(missingFault(joints, { joint: 'a', kind: 'limp' })).toBeNull();
    expect(missingFault(joints, { joint: 'b', kind: 'limp' })).toBe(faultRefusal('b'));
    expect(missingFault(joints, { joint: 'c', kind: 'limp' })).toBe(faultRefusal('c'));
    expect(missingFault(joints, { joint: 'z', kind: 'limp' })).toBe('z isn’t a servo on this robot.');
  });

  it('travels with a shared Case', () => {
    const kase = walkCase([KNEE]);
    const bundle = galleryBundleOf({
      slug: 'quad-walk-1a2b3c',
      title: 'Walk: Quad',
      robotName: 'Quad',
      parts: quad.parts,
      joints: quad.joints,
      kase,
    });
    const read = readGalleryBundleBytes(galleryBundleBytes(bundle));

    expect(read.case.faults).toEqual([KNEE]);
    expect(read.case).toEqual(kase);
  });
});
