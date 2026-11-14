import { expect, it } from 'vitest';
import { quadrupedFixture } from '../merge/merge.fixtures';
import { lettersOf, writePlates } from './labelPlates.fixtures';

it('labels the quadruped’s plates in under 2 s more than writing them plain', async () => {
  const quadruped = quadrupedFixture().parts;
  const letters = lettersOf(quadruped);
  const started = performance.now();

  await writePlates(quadruped);

  const plain = performance.now() - started;
  const again = performance.now();

  await writePlates(quadruped, letters);

  expect(performance.now() - again - plain).toBeLessThan(2000);
});
