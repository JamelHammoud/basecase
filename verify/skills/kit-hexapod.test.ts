import { beforeAll, describe, expect, it } from 'vitest';
import { clearKitOut, kitTimeout, kitTitle, trainAndJudge } from './kit';
import { KIT_PLANS } from './plans';

describe('Motor Kit on hexapod', () => {
  beforeAll(() => clearKitOut('hexapod'));

  for (const plan of KIT_PLANS['hexapod'])
    it(
      kitTitle(plan),
      async () => expect(await trainAndJudge('hexapod', plan)).toMatch(/^[0-9a-f]{64}$/),
      kitTimeout(plan),
    );
});
