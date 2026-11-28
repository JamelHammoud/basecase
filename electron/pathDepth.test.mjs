import { describe, expect, it } from 'vitest';
import { pathDepth } from './pathDepth.mjs';

describe('path depth', () => {
  it('counts empty components and preserves literal separator semantics', () => {
    const paths = ['', '/', '//', 'robot.urdf', '/robot/', 'a//b', 'a\\b', 'a%2Fb', '机器人/🦾/model.xml'];

    for (let i = 0; i < 120; i++) paths.push(`${'folder/'.repeat(i)}model.urdf`);

    for (const path of paths) expect(pathDepth(path)).toBe(path.split('/').length);
  });
});
