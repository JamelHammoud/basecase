import { expect, it } from 'vitest';
import { addConstraint, addRectangle, applicableConstraints, setConstraintValue } from './edit';
import { referenceSketch } from './face';

it('authors an edge offset through the same selection action used by Sketch', () => {
  const reference = referenceSketch([
    [
      [-80, -50],
      [80, -50],
    ],
    [
      [80, -50],
      [80, 50],
    ],
    [
      [80, 50],
      [-80, 50],
    ],
    [
      [-80, 50],
      [-80, -50],
    ],
  ]);
  const rectangle = addRectangle(reference, { corner: { at: [-48, -20] }, opposite: [-8, 0], width: 40, height: 20 })!;
  const corner = rectangle.sketch.points.find((p) => !p.fixed)!;

  expect(applicableConstraints(rectangle.sketch, [corner.id, 'e4'])).toContain('distance');

  const constrained = addConstraint(rectangle.sketch, 'distance', [corner.id, 'e4'])!;
  const dimension = constrained.constraints.find((c) => c.kind === 'distance')!;
  const edited = setConstraintValue(constrained, dimension.id, 8)!;

  expect(edited.points.find((p) => p.id === corner.id)!.x).toBeCloseTo(-72, 6);
  expect(edited.constraints.find((c) => c.id === dimension.id)).toMatchObject({ value: 8 });
});
