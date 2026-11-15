import { describe, expect, it } from 'vitest';
import { canImportLink } from './importLink';

describe('Import link readiness', () => {
  it.each([
    'https://app.roboflow.com/workspace/project/2',
    'https://universe.roboflow.com/workspace/project/dataset/2',
  ])('accepts Roboflow links on desktop: %s', (link) => {
    expect(canImportLink(link, true)).toBe(true);
    expect(canImportLink(link, false)).toBe(false);
  });

  it('keeps Hub links and robot files while refusing unrelated pages', () => {
    expect(canImportLink('https://huggingface.co/datasets/owner/mugs', true)).toBe(true);
    expect(canImportLink('https://example.com/robot.urdf', false)).toBe(true);
    expect(canImportLink('https://roboflow.com.example.org/workspace/project/2', true)).toBe(false);
  });
});
