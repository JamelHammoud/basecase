import { describe, expect, it } from 'vitest';
import { cadAgentInstructions } from './cad-agent-prompt.mjs';

describe('the agent’s slash commands', () => {
  it('teaches with the skill tools and makes no part for /train', () => {
    const train = cadAgentInstructions()
      .split('\n- ')
      .find((line) => line.startsWith('/train'));

    expect(train).toMatch(/never makes, inserts\s+or changes a part/);
    expect(train).toMatch(/draft_skill/);
    expect(train).toMatch(/train_skill/);
  });
});
