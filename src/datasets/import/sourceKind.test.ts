import { describe, expect, it } from 'vitest';
import { isLeRobotFolder, sourceKind } from './sourceKind';

describe('dataset folder discovery', () => {
  it('keeps shallowest lexical LeRobot precedence across mixed repository orders and edits', () => {
    const paths = ['z/meta/info.json', 'deep/a/meta/info.json', 'a/meta/info.json', 'metadata.yaml', 'photo.png'];

    for (let i = 0; i < paths.length; i++) {
      const rotated = [...paths.slice(i), ...paths.slice(0, i)];
      const original = [...rotated];

      expect(isLeRobotFolder(rotated)).toBe('a');
      expect(sourceKind(rotated)).toBe('lerobot');
      expect(rotated).toEqual(original);
    }

    expect(isLeRobotFolder([...paths, 'meta/info.json'])).toBe('');
    expect(isLeRobotFolder(paths.filter((p) => p !== 'a/meta/info.json'))).toBe('z');
    expect(isLeRobotFolder(['meta/other.json', 'meta/info.json.backup'])).toBeNull();
  });
});
