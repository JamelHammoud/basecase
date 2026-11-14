import { describe, expect, it } from 'vitest';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { liveModelErrors, modelLoadErrors, RoutineModelError } from './liveModels';

const plan = () => {
  const compiled = compileRoutine(greetingRoutine(), { skills: FIXTURE_SKILLS });

  if (!compiled.ok) throw new Error('Compile the greeting.');

  return compiled.plan;
};

describe('live model refusals', () => {
  it('names the unsupported node and its required model before a live run', () => {
    const errors = liveModelErrors(plan());

    expect(errors).toContainEqual(
      expect.objectContaining({
        code: 'missing-model',
        path: 'recognize',
        message: expect.stringContaining('Check Face'),
      }),
    );
    expect(errors.some((error) => error.message.includes('YOLO11n'))).toBe(false);
  });

  it('keeps a failed download attached to its node in the existing error reply shape', () => {
    const errors = modelLoadErrors(plan(), 'person-detection', new Error('Download failed.'));
    const refusal = new RoutineModelError(errors);

    expect(refusal.errors).toEqual([
      { code: 'missing-model', path: 'person', message: 'See Person couldn’t load YOLO11n. Download failed.' },
    ]);
    expect(refusal.message).toContain('See Person');
  });
});
