import { describe, expect, it } from 'vitest';
import { withActuation } from '../joints/declare';
import { declareJoints } from '../workspace/agentBuildRequests';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../workspace/docHistory';
import { fallsKey, walkKey } from '../workspace/storedWalk';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { passiveMechanism, passiveMechanisms } from './fixtures/passiveMechanisms';
import { buildMjcf } from './mjcf';
import { buildRig } from '../utils/kinematics';
import { parseXml } from '../utils/robotImport/robotImport.fixtures';
import { parseMjcf } from '../utils/robotImport/mjcf';
import { parseUrdf } from '../utils/robotImport/urdf';
import { writeUrdf } from '../utils/robotImport/urdfWriter';

const fixture = () => passiveMechanism(passiveMechanisms[8]);

describe('passive declaration persistence', () => {
  it('saves and reloads actuation and uses the existing undo and redo history', async () => {
    const { project, parts } = fixture();
    const next = { ...project, joints: withActuation(project.joints, 'joint_0', 'passive') };
    const doc = pushHistory(docFromParts(parts), parts, trackedOf(project));
    const undo = travelProject(doc, next, { direction: 'undo' })!;
    const redo = travelProject(undo.doc, { ...next, ...undo.project }, { direction: 'redo' })!;

    expect(undo.project.joints).toEqual(project.joints);
    expect(redo.project.joints).toEqual(next.joints);

    const restored = await decodeSceneFile(
      await encodeSceneFile(sharedScene({ name: 'Passive arm', globalGoal: '', parts, project: next })),
    );

    expect(restored.project?.joints).toEqual(next.joints);
    expect(walkKey(parts, next)).not.toBe(walkKey(parts, project));
    expect(fallsKey(parts, next)).not.toBe(fallsKey(parts, project));

    const model = buildMjcf({
      parts,
      project: next,
      rig: buildRig(next.joints, parts),
      measures: {},
      partTriangles: () => null,
    });

    expect(model.robots[0].fingerprint).not.toBe(fixture().model.robots[0].fingerprint);
  });

  it('keeps unspecified imported scene joints powered and refuses contradictory tool records', async () => {
    const { project, parts } = fixture();
    const legacy = {
      ...project,
      joints: project.joints.map(({ actuation, ...j }) => ({ ...j, name: actuation ? j.name : j.id })),
    };
    const restored = await decodeSceneFile(
      await encodeSceneFile(sharedScene({ name: 'Legacy', globalGoal: '', parts, project: legacy })),
    );
    const model = buildMjcf({
      parts,
      project: restored.project!,
      rig: buildRig(restored.project!.joints!, parts),
      measures: {},
      partTriangles: () => null,
    });

    expect(model.joints.map((j) => j.actuator)).toEqual([0, 1]);

    const result = declareJoints(
      {
        joints: [
          {
            id: 'bad',
            parent: ['base'],
            child: ['link_0'],
            actuation: 'passive',
            actuators: ['base'],
            origin: [0, 0, 0],
            axis: [1, 0, 0],
          },
        ],
      },
      parts,
      project,
      () => null,
    );

    expect(result.next.joints).toEqual(project.joints);
    expect(result.text).toContain('a passive joint cannot have actuators');
  });

  it('retains passive joints and physical resistance in MJCF and URDF import', () => {
    const { parts, project, model } = fixture();
    const parsed = parseMjcf(parseXml(model.xml));

    expect(parsed.joints.filter((j) => j.type !== 'fixed').map((j) => j.actuation)).toEqual(['powered', 'passive']);

    const { urdf } = writeUrdf({
      name: 'Arm',
      model,
      joints: project.joints,
      parts,
      masses: [],
      triangles: () => null,
    });
    const imported = parseUrdf(parseXml(urdf));

    expect(imported.joints.find((j) => j.name === model.joints[1].name)?.actuation).toBe('passive');
    expect(urdf).toContain('effort="0"');
  });
});
