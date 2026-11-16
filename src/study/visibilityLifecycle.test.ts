import { describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import { visibilityFixture } from './visibilityFixtures';
import { StudyVisibilitySession } from './visibilitySession';
import { StudyWireWriter } from './wire';
import { studyScene, studyFingerprint } from './study';

async function fixture() {
  const design = await visibilityFixture(0);
  const request = {
    tryId: design.stored.id,
    cameras: ['eye'],
    targets: [{ id: 'target', minPixels: 100 }],
    samples: 4,
  };
  const source = {
    parts: design.parts,
    world: design.world,
    views: design.views,
    model: design.model,
    kase: design.kase,
  };

  return {
    design,
    input: { request, stored: design.stored, bytes: encodeRecording(design.recording), scene: source, candidates: 1 },
  };
}

describe('Study capture lifetime', () => {
  it('pins content identities, clears replaced sessions and rejects stale models or missing poses', async () => {
    const { design, input } = await fixture();
    const create = vi.fn(() => {
      throw new Error('Captures unavailable');
    });
    const session = new StudyVisibilitySession(create);
    const first = await session.load(input);
    const again = await session.load(input);

    expect(again).toBe(first);
    expect(create).not.toHaveBeenCalled();
    design.recording.poses[0] += 1;
    expect(await session.load({ ...input, bytes: encodeRecording(design.recording) })).not.toBe(first);
    await expect(
      session.load({ ...input, stored: { ...input.stored, robot: { ...input.stored.robot, modelHash: 'stale' } } }),
    ).rejects.toThrow('changed');
    await expect(session.load({ ...input, bytes: new Uint8Array() })).rejects.toThrow();
    await expect(session.load({ ...input, request: { ...input.request, targets: [] } })).rejects.toThrow();
    session.dispose();
    await expect(
      session.measure({ parts: design.parts, project: design.project, triangles: {}, measures: {} }),
    ).rejects.toThrow('source try');
  });

  it('bounds repeated modules before constructing a render context and transfers immutable geometry once', async () => {
    const { design, input } = await fixture();
    const create = vi.fn(() => {
      throw new Error('No render context expected');
    });
    const session = new StudyVisibilitySession(create);
    const parts = Array.from({ length: 257 }, (_, i) => ({ ...design.parts[0], id: `module-${i}` }));

    await expect(session.load({ ...input, scene: { ...input.scene, parts } })).rejects.toThrow('256');
    expect(create).not.toHaveBeenCalled();

    const writer = new StudyWireWriter();
    const base = {
      parts: design.parts,
      project: design.project,
      measures: {},
      triangles: { target: new Float32Array(900) },
    };
    const initial = writer.write(base);
    const chosen = await studyScene(
      base,
      [{ id: 'lens', kind: 'camera_lens', part: 'eye', values: [{ model: 'fisheye', fovDeg: 180 }] }],
      [0],
    );
    const next = writer.write(chosen);
    const binary = (packet: typeof initial) => packet.assets.filter((asset) => asset.node.kind === 'binary');

    expect(binary(initial)).toHaveLength(1);
    expect(binary(next)).toHaveLength(0);
    expect(studyFingerprint(chosen.parts, chosen.project)).not.toBe(studyFingerprint(base.parts, base.project));
  });
});
