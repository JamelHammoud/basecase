import { describe, expect, it } from 'vitest';
import { compareDesigns, mergeDesigns, snapshotMatches } from './versionMerge';
import {
  versionJoint as joint,
  versionPart as part,
  versionScene as scene,
  versionPortPart as portPart,
} from './sceneVersions.fixtures';

const changed = (id: string) => `part:${id}`;

it('invalidates a captured comparison when another checkpoint changes either history without editing the design', () => {
  const design = scene([part('body')]);
  const current = { ...design, history: 'compared graph' };

  expect(snapshotMatches(current, design, 'compared graph')).toBe(true);
  expect(snapshotMatches({ ...current, history: 'new named version' }, design, 'compared graph')).toBe(false);
  expect(snapshotMatches(current, { ...design, parts: [part('body', 10)] }, 'compared graph')).toBe(false);
});

describe('design comparison and dependency-closed three-way merge', () => {
  it('compares grippers by addition and removal and leg lengths by changed geometry', () => {
    const grippers = compareDesigns(scene([part('parallel')]), scene([part('three-finger')]));
    const legs = compareDesigns(
      scene([part('leg')]),
      scene([{ ...part('leg'), dimensions: { width: 20, height: 40, depth: 20 } }]),
    );

    expect(grippers.parts.map((p) => [p.id, p.change])).toEqual([
      ['parallel', 'removed'],
      ['three-finger', 'added'],
    ]);
    expect(legs.parts.map((p) => [p.id, p.change])).toEqual([['leg', 'changed']]);
    expect(legs.ours).not.toBe(legs.theirs);
  });

  it('merges a camera mount with required joint and mate dependencies independently of leg changes', () => {
    const base = scene([portPart('body', 'top'), part('leg')]);
    const ours = scene([portPart('body', 'top'), part('leg', 30)]);
    const camera = {
      ...portPart('camera', 'base'),
      mates: [{ port: 'base', target: 'body', targetPort: 'top', type: 'fastened' as const }],
    };
    const theirs = scene([portPart('body', 'top'), part('leg'), camera], [joint('camera-joint', 'body', 'camera')]);
    const merged = mergeDesigns({ base, ours, theirs, selected: [changed('camera')] });

    expect(merged.conflicts).toEqual([]);
    expect(merged.dangling).toEqual([]);
    expect(merged.required).toContain('joint:camera-joint');
    expect(merged.scene?.parts.find((p) => p.id === 'leg')?.position[0]).toBe(30);
    expect(merged.scene?.project.joints).toEqual(theirs.project.joints);
    expect(theirs.parts).toHaveLength(3);
    expect(ours.parts).toHaveLength(2);
  });

  it('requires explicit choices for conflicting joint edits', () => {
    const j = joint('hinge', 'body', 'arm');
    const base = scene([part('body'), part('arm')], [j]);
    const ours = { ...base, project: { ...base.project, joints: [{ ...j, damping: 2 }] } };
    const theirs = { ...base, project: { ...base.project, joints: [{ ...j, damping: 4 }] } };
    const request = { base, ours, theirs, selected: ['joint:hinge'] };
    const conflict = mergeDesigns(request);
    const resolved = mergeDesigns({ ...request, resolutions: { 'joint:hinge': 'incoming' } });

    expect(conflict.scene).toBeNull();
    expect(conflict.conflicts).toEqual(['joint:hinge']);
    expect(resolved.scene?.project.joints?.[0].damping).toBe(4);
  });

  it('refuses dangling mates and joints and retains required project fields', () => {
    const base = scene([part('body')]);
    const invalid = scene([part('camera')], [joint('missing-body', 'gone', 'camera')]);
    const refused = mergeDesigns({ base, ours: base, theirs: invalid, selected: [changed('camera')] });

    expect(refused.scene).toBeNull();
    expect(refused.dangling).toContain('part:gone');

    const theirs = {
      ...scene([part('body'), part('camera')]),
      project: {
        ...base.project,
        marks: [{ id: 'mount-mark', partIds: ['camera'], points: [], createdAt: '2026-11-16' }],
      },
    };
    const merged = mergeDesigns({ base, ours: base, theirs, selected: [changed('camera')] });

    expect(merged.required).toContain('project:marks');
    expect(merged.scene?.project.marks).toEqual(theirs.project.marks);
  });

  it('does not import readiness decisions or local evidence from an incoming design', () => {
    const base = scene([part('body')]);
    const theirs = { ...scene([part('body'), part('camera')]), project: { ...base.project, triesStored: true } };
    const merged = mergeDesigns({ base, ours: base, theirs, selected: [changed('camera'), 'project:triesStored'] });

    expect(merged.scene?.project.triesStored).toBeUndefined();
    expect(compareDesigns(base, merged.scene!).ours).not.toBe(compareDesigns(base, merged.scene!).theirs);
  });
});

it('keeps independently edited existing parent parts while merging their dependent mount', () => {
  const base = scene([portPart('body', 'top')]);
  const ours = scene([{ ...portPart('body', 'top'), position: [30, 0, 0] }]);
  const camera = {
    ...portPart('camera', 'base'),
    mates: [{ port: 'base', target: 'body', targetPort: 'top', type: 'fastened' as const }],
  };
  const theirs = scene([portPart('body', 'top'), camera]);
  const merged = mergeDesigns({ base, ours, theirs, selected: ['part:camera'] });

  expect(merged.conflicts).toEqual([]);
  expect(merged.scene?.parts.find((part) => part.id === 'body')?.position[0]).toBe(30);
});

it('includes the joints of newly required assembly members without importing edits attached to existing parents', () => {
  const base = scene([part('body'), part('leg')], [joint('leg-joint', 'body', 'leg')]);
  const camera = { ...part('camera'), mirrorOf: { id: 'arm', axis: 'x' as const } };
  const theirs = scene(
    [...base.parts, part('arm'), camera],
    [{ ...base.project.joints![0], damping: 9 }, joint('shoulder', 'body', 'arm'), joint('wrist', 'arm', 'camera')],
  );
  const merged = mergeDesigns({ base, ours: base, theirs, selected: ['part:camera'] });

  expect(merged.conflicts).toEqual([]);
  expect(merged.dangling).toEqual([]);
  expect(merged.required).toContain('joint:shoulder');
  expect(merged.required).toContain('joint:wrist');
  expect(merged.scene?.project.joints?.find((entry) => entry.id === 'leg-joint')).toEqual(base.project.joints![0]);
  expect(merged.scene?.parts).toHaveLength(4);
});

it('requires an explicit incoming choice before restoring a required part deleted in the target', () => {
  const body = portPart('body', 'top');
  const base = scene([body]);
  const ours = scene([]);
  const camera = {
    ...portPart('camera', 'base'),
    mates: [{ port: 'base', target: 'body', targetPort: 'top', type: 'fastened' as const }],
  };
  const theirs = scene([body, camera]);
  const request = { base, ours, theirs, selected: ['part:camera'] };
  const conflict = mergeDesigns(request);
  const chosen = mergeDesigns({ ...request, resolutions: { 'part:body': 'incoming' } });

  expect(conflict.conflicts).toContain('part:body');
  expect(conflict.scene).toBeNull();
  expect(chosen.scene?.parts.map((part) => part.id)).toEqual(['camera', 'body']);
});

it('refuses missing mate ports and project references after selected removals', () => {
  const base = scene([portPart('body', 'top')]);
  const camera = {
    ...portPart('camera', 'base'),
    mates: [{ port: 'base', target: 'body', targetPort: 'gone', type: 'fastened' as const }],
  };
  const theirs = scene([...base.parts, camera]);
  const refused = mergeDesigns({ base, ours: base, theirs, selected: ['part:camera'] });

  expect(refused.scene).toBeNull();
  expect(refused.dangling).toContain('port:body:gone');
});

it('merges a skeleton-framed part with its project dependency without treating its frame as a part id', () => {
  const base = scene([part('body')]);
  const skeleton = {
    frame: 'z-up' as const,
    joints: [{ id: 'hip', origin: [0, 0, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number] }],
    pairs: [],
  };
  const theirs = {
    ...scene([part('body'), { ...part('shell'), frame: 'hip' }]),
    project: { ...base.project, skeleton },
  };
  const merged = mergeDesigns({ base, ours: base, theirs, selected: ['part:shell'] });

  expect(merged.conflicts).toEqual([]);
  expect(merged.dangling).toEqual([]);
  expect(merged.required).toContain('project:skeleton');
  expect(merged.scene?.project.skeleton).toEqual(skeleton);
});
