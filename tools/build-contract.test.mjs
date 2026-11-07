import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the committed contract WASM', () => {
  const bytes = fs.readFileSync(new URL('../src/skills/contract.wasm', import.meta.url));

  it('stays small', () => {
    expect(bytes.length).toBeLessThan(200 * 1024);
  });

  it('holds no machine paths', () => {
    for (const leak of ['/Users/', '/home/', 'worktrees', '/private/', '/var/folders']) {
      expect(bytes.includes(leak)).toBe(false);
    }
  });
});
