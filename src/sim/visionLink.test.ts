import { describe, expect, it, vi } from 'vitest';
import { compileRoutine } from '../routines/compile';
import { newRoutine } from '../routines/edit';
import { FIXTURE_SKILLS } from '../routines/fixtureSkills';
import { VisionLink } from './visionLink';

const { startVision } = vi.hoisted(() => ({ startVision: vi.fn() }));

vi.mock('../vision/client', () => ({ startVision }));

function plan() {
  const routine = newRoutine({ id: 'vision', name: 'Camera test', mover: 'legs' });

  routine.requires.push('camera');
  routine.watchers = ['person-detection', 'object-detection'].map((model, i) => ({
    id: `sense${i}`,
    model,
    rateHz: 5,
    maxAgeMs: 1000,
    publishes: { type: 'boolean' },
  }));

  const compiled = compileRoutine(routine, { skills: FIXTURE_SKILLS });

  if (!compiled.ok) throw new Error('Compile the camera test.');

  return compiled.plan;
}

describe('live Routine vision lifetime', () => {
  it('releases a model that finishes loading after Stop and starts no later model', async () => {
    const release = vi.fn();
    let resolve: ((stop: () => void) => void) | undefined;
    const loading = new Promise<() => void>((done) => {
      resolve = done;
    });
    const link = new VisionLink();

    startVision.mockReset().mockReturnValueOnce(loading);

    const started = link.start(plan());

    link.stop();
    resolve?.(release);
    expect(await started).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(startVision).toHaveBeenCalledOnce();
  });

  it('returns the named node and model when a download fails', async () => {
    startVision.mockReset().mockRejectedValueOnce(new Error('Download failed.'));

    await expect(new VisionLink().start(plan())).rejects.toMatchObject({
      errors: [
        { code: 'missing-model', path: 'sense0', message: 'See Person couldn’t load YOLO11n. Download failed.' },
      ],
    });
  });
});
