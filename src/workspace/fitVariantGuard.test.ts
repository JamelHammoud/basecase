import { expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { generatedFit } from '../print/fitVariants.fixtures';
import { fitVariantCurrent } from './fitVariantGuard';

it('rejects scene switching, hidden tabs, changed declarations, material changes, source edits and deletion even when names match', async () => {
  const design = await generatedFit();
  const project = { ...DEFAULT_PROJECT, designParameters: design.parameters };
  const saved = { source: design, project, scene: 'bearing' };
  const current = { parts: design.parts, project, scene: 'bearing', active: true };

  expect(fitVariantCurrent(saved, current)).toBe(true);

  const changes = [
    { ...current, scene: 'other-bearing' },
    { ...current, active: false },
    { ...current, project: { ...project, designParameters: structuredClone(design.parameters) } },
    { ...current, project: { ...project, material: 'PLA' as const } },
    { ...current, parts: [{ ...design.parts[0], position: [1, 0, 0] as [number, number, number] }, design.parts[1]] },
    { ...current, parts: design.parts.slice(1) },
  ];

  for (const changed of changes) expect(fitVariantCurrent(saved, changed)).toBe(false);
});
