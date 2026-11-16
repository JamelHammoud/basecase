import { describe, expect, it } from 'vitest';
import { classroomFixture } from './fixtures';
import { assignmentOf, submissionOf, readAssignment, readSubmission, classroomBytes, pinnedBundle } from './envelope';

describe('classroom portable authority', () => {
  it('round trips the teacher definition and ignores submitted Cases, budgets and claimed scores', async () => {
    const { bundle } = classroomFixture();
    const assignment = await assignmentOf(bundle, 60);
    const submitted = await submissionOf(assignment, bundle, 'Ada');
    const forged = { ...submitted, score: 100, ready: true, project: { budgetUsd: 100000 }, case: { task: {} } };
    const original = await readAssignment(classroomBytes(assignment));
    const submission = await readSubmission(classroomBytes(forged));
    const pinned = await pinnedBundle(original, submission);

    expect(pinned.case).toEqual(assignment.bundle.case);
    expect(pinned.robot).toEqual(bundle.robot);
    expect(pinned).not.toHaveProperty('score');
    expect(submission).not.toHaveProperty('project');
    expect(original.controller).toBe('reference');
    expect(original.seeds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('refuses a replaced rubric or assignment revision even with a valid new fingerprint', async () => {
    const { bundle } = classroomFixture();
    const assignment = await assignmentOf(bundle, 60);
    const submission = await submissionOf(assignment, bundle, 'Ada');
    const edited = { ...assignment, budgetUsd: 6000 };

    await expect(readAssignment(classroomBytes(edited))).rejects.toThrow(/fingerprint/);

    const revised = await assignmentOf(bundle, 61, assignment.id);

    await expect(pinnedBundle(revised, submission)).rejects.toThrow(/revision/);
  });

  it('deduplicates identical robot revisions without merging duplicate names', async () => {
    const { bundle } = classroomFixture();
    const assignment = await assignmentOf(bundle, 60);
    const a = await submissionOf(assignment, bundle, 'Same');
    const again = await submissionOf(assignment, bundle, 'Same');
    const changed = structuredClone(bundle);

    changed.robot.parts[0].dimensions.width += 10;

    const b = await submissionOf(assignment, changed, 'Same');

    expect(a.fingerprint).toBe(again.fingerprint);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('refuses missing world content, unavailable component meshes and oversized or executable robot data', async () => {
    const { bundle } = classroomFixture();
    const incomplete = structuredClone(bundle);

    incomplete.robot.parts[0] = { ...incomplete.robot.parts[0], kind: 'component', componentId: 'sourced-missing' };

    await expect(assignmentOf(incomplete, 60)).rejects.toThrow(/mesh|component/);

    const executable = structuredClone(bundle);

    Object.assign(executable.robot.parts[0], { kind: 'custom', code: 'throw Error()' });
    await expect(assignmentOf(executable, 60)).rejects.toThrow(/supported/);
    await expect(readAssignment(new Uint8Array(8 * 1024 * 1024 + 1))).rejects.toThrow(/large/);
    await expect(readAssignment(new TextEncoder().encode('{'))).rejects.toThrow();
  });
});

describe('classroom malformed robot bounds', () => {
  it.each([
    'cycles',
    'duplicate parts',
    'unknown links',
    'nonfinite effort',
    'text mass',
    'missing mesh',
    'oversized geometry',
  ])('refuses %s before a worker can evaluate the robot', async (fault) => {
    const { bundle } = classroomFixture();
    const altered = structuredClone(bundle);
    const changes: Record<string, () => void> = {
      cycles: () => {
        altered.robot.joints[0].parentJoint = altered.robot.joints[0].id;
      },
      'duplicate parts': () => {
        altered.robot.parts.push(altered.robot.parts[0]);
      },
      'unknown links': () => {
        altered.robot.joints[0].child = ['missing'];
      },
      'nonfinite effort': () => {
        altered.robot.joints[0].effortNm = Infinity;
      },
      'text mass': () => {
        Object.assign(altered.robot.parts[0], { massG: 'fake mass' });
      },
      'missing mesh': () => {
        altered.robot.parts[0].kind = 'mesh';
      },
      'oversized geometry': () => {
        altered.robot.parts[0].dimensions.width = 500001;
      },
    };

    changes[fault]();
    await expect(assignmentOf(altered, 60)).rejects.toThrow();
  });
});

it('keeps exact imported worlds and refuses missing or changed world bytes', async () => {
  const { meshWorldAsset } = await import('../cases/worldAssets.fixtures');
  const { hashWorldAsset, serializeWorldAssets } = await import('../cases/worldAssets');
  const { bundle } = classroomFixture();
  const asset = meshWorldAsset();
  const hash = await hashWorldAsset(asset);
  const world = {
    ...bundle,
    case: {
      ...bundle.case,
      world: { ...bundle.case.world, imported: { hash, position: [0, 0, 0] as [number, number, number] } },
    },
    worldAssets: serializeWorldAssets({ [hash]: asset }),
  };
  const assignment = await assignmentOf(world, 60);

  expect((await readAssignment(classroomBytes(assignment))).bundle.worldAssets).toEqual(world.worldAssets);
  await expect(assignmentOf({ ...world, worldAssets: undefined }, 60)).rejects.toThrow('missing');

  const tampered = structuredClone(world);

  tampered.worldAssets[hash].world.name = 'Changed';
  await expect(assignmentOf(tampered, 60)).rejects.toThrow();
});

it('preserves material, infill and power without accepting submitted budget or readiness settings', async () => {
  const { bundle } = classroomFixture();
  const design = { material: 'PETG' as const, infillPct: 80, tether: { volts: 7.4, amps: 3 } };
  const assignment = await assignmentOf(bundle, 60, 'materials', design);
  const submission = await submissionOf(assignment, bundle, 'Ada', { ...design, infillPct: 100 });
  const restored = await readSubmission(
    classroomBytes({ ...submission, budgetUsd: 100000, readiness: { status: 'ready' } }),
  );

  expect((await readAssignment(classroomBytes(assignment))).design).toEqual(design);
  expect(restored.design).toEqual({ ...design, infillPct: 100 });
  expect(restored).not.toHaveProperty('budgetUsd');
  await expect(readAssignment(classroomBytes({ ...assignment, rubricRevision: 2 }))).rejects.toThrow('rubric');
});
