import { describe, expect, it } from 'vitest';
import { cachedInputTokens, tokenCount } from './usageReport.mjs';

describe('provider token accounting', () => {
  it('counts Claude cache reads and writes as input while reporting cache reads separately', () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 };

    expect(tokenCount(usage)).toBe(135);
    expect(cachedInputTokens(usage)).toBe(100);
  });

  it('does not add Codex cached input twice because it is already included in input tokens', () => {
    const usage = { input_tokens: 100, output_tokens: 5, cached_input_tokens: 80 };

    expect(tokenCount(usage)).toBe(105);
    expect(cachedInputTokens(usage)).toBe(80);
  });
});
