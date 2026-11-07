import { beforeAll, describe, expect, it } from 'vitest';
import { clearKitOut, kitTimeout, kitTitle, trainAndJudge } from './kit';
import { KIT_PLANS } from './plans';

describe('Motor Kit on biped-servo', () => {
  beforeAll(() => clearKitOut('biped-servo'));

  for (const plan of KIT_PLANS['biped-servo'])
    it(
      kitTitle(plan),
      async () => expect(await trainAndJudge('biped-servo', plan)).toMatch(/^[0-9a-f]{64}$/),
      kitTimeout(plan),
    );
});
