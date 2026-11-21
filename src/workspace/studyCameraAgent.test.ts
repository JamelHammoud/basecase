import { expect, it, vi } from 'vitest';
import { visibilityDesign } from '../study/visibilityFixtures';
import { studyRequest, type StudyContext } from './agentStudyRequest';

it('routes camera poses, supported lenses and pinned visibility through study_design in the agent frame', async () => {
  const { kase } = visibilityDesign(0);
  const run = vi.fn(async () => 'captured');
  const ctx: StudyContext = {
    cases: { cases: [kase], active: kase },
    study: { run },
    setAction: () => {},
  };
  const visibility = { tryId: 'saved', cameras: ['eye'], targets: [{ id: 'target', minPixels: 20 }], samples: 4 };

  await studyRequest(
    {
      case: kase.id,
      visibility,
      knobs: [
        { id: 'pose', kind: 'camera_pose', part: 'eye', values: [{ position: [1, 2, 3], rotation: [0, 0, 90] }] },
        { id: 'lens', kind: 'camera_lens', part: 'eye', values: [{ model: 'fisheye', fovDeg: 200 }] },
      ],
    },
    ctx,
  );

  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      kase,
      visibility,
      knobs: [
        { id: 'pose', kind: 'camera_pose', part: 'eye', values: [{ position: [1, 3, -2], rotation: [0, 90, 0] }] },
        { id: 'lens', kind: 'camera_lens', part: 'eye', values: [{ model: 'fisheye', fovDeg: 200 }] },
      ],
    }),
  );
  expect(await studyRequest({ visibility: { ...visibility, samples: 33 } }, ctx)).toMatchObject({ ok: false });
});
