import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const headerPads = { 1: [0, 0], 2: [2.5, 0], 3: [5, 0] };
const regulatorPads = {
  VOUT_1: [-6.35, 11.43],
  VOUT_2: [-6.35, 8.89],
  GND1_1: [-3.81, 11.43],
  GND1_2: [-3.81, 8.89],
  GND2_1: [-1.27, 11.43],
  GND2_2: [-1.27, 8.89],
  VIN_1: [1.27, 11.43],
  VIN_2: [1.27, 8.89],
  VRP_1: [3.81, 11.43],
  VRP_2: [3.81, 8.89],
  CONTROL_1: [6.35, 11.43],
  CONTROL_2: [6.35, 8.89],
};

export async function checkBoardTransforms({ fixture, cli, dir, expectedCount }) {
  const files = fixture.board.transforms.map((variant, index) => `transform-${index}.kicad_pcb`);

  for (const [index, filename] of files.entries())
    await fs.writeFile(path.join(dir, filename), fixture.board.transforms[index].pcb);

  const parsed = JSON.parse(cli(['pcb.py', '--inspect-many', ...files], dir, 'python3'));

  for (const [index, facts] of parsed.entries()) {
    const { side, rotation } = fixture.board.transforms[index];
    const angle = (rotation * Math.PI) / 180;

    assert.equal(facts.locations.length, expectedCount);

    for (const pad of facts.locations) {
      const placement = fixture.board.definition.placements.find((item) => `BC_${item.id}` === pad.reference);
      const [x, localZ] = (placement.productId === 'jst-b3b-eh-a' ? headerPads : regulatorPads)[pad.pad];
      const z = localZ * (side === 'top' ? 1 : -1);
      const expected = [
        placement.position[0] + x * Math.cos(angle) - z * Math.sin(angle),
        placement.position[1] + x * Math.sin(angle) + z * Math.cos(angle),
      ];

      assert.equal(pad.side, side);
      assert.ok(
        pad.position.every((coordinate, axis) => Math.abs(coordinate - expected[axis]) < 0.00001),
        `${fixture.name} ${side} ${rotation} ${pad.reference}/${pad.pad}: ${pad.position} != ${expected}`,
      );
    }
  }

  return parsed.length;
}
