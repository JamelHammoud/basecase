import { describe, expect, it, vi } from 'vitest';
import { keepSharedVideoBlob } from '../../cameras/recorded/videoStore';
import { lerobotFiles } from '../lerobot';
import { importHandlers } from './dataImportJobs';
import { namedArm, sceneModel, SO101_JOINTS } from './fixtures';
import { importStep, matchInput } from './importPlan';

vi.mock('../../cameras/recorded/videoStore', () => ({ keepSharedVideoBlob: vi.fn(async () => undefined) }));

const clip = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

function dataset() {
  const frames = 8;
  const joints = SO101_JOINTS.length;

  return lerobotFiles({
    robotType: 'so101_follower',
    jointNames: SO101_JOINTS,
    videos: [{ key: 'front', width: 64, height: 48, codec: 'h264' }],
    episodes: [
      {
        task: 'Pick up cube',
        frames: Array.from({ length: frames }, (_, i) => i),
        timestamps: Float32Array.from({ length: frames }, (_, i) => i / 30),
        state: new Float32Array(frames * joints),
        action: new Float32Array(frames * joints),
        videos: { front: clip },
        imageStats: {},
        source: {},
      },
    ],
    source: {},
  });
}

describe('imported camera video retention', () => {
  it('keeps a referenced clip under the resulting try for the playback worker', async () => {
    const handlers = importHandlers();
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const summary = await handlers.read({ kind: 'bytes', name: 'pick', files: dataset() });

    if (!summary) throw new Error('Missing dataset');

    const step = importStep({
      input: matchInput(summary, model),
      model,
      robotType: summary.robotType,
      remembered: null,
    });

    if (step.kind !== 'ready') throw new Error('Missing joint plan');

    const built = await handlers.build({
      model,
      plan: step.plan,
      target: {
        sceneId: 'scene',
        modelHash: 'model',
        origin: { kind: 'file', name: 'pick', hash: summary.hash },
        startedAt: '2026-11-14T00:00:00.000Z',
      },
    });
    const stored = built.kept[0].stored;
    const video = stored.videos![0];
    const kept = vi.mocked(keepSharedVideoBlob).mock.calls;

    expect(video.camera).toBe('front');
    expect(kept).toHaveLength(1);
    expect(kept[0][2]).toEqual([{ id: stored.id, path: video.path }]);
    expect(new Uint8Array(await kept[0][1].arrayBuffer())).toEqual(clip);
  });
});
