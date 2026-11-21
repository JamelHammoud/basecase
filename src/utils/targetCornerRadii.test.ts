import { expect, it } from 'vitest';
import { maskBounds } from './silhouetteProfile';
import { cornerRadii } from './targetFit';

function reachableArea(cells: Uint8Array, width: number, corner: number[], reach: number) {
  const [x, y, sx, sy] = corner;
  const reachable = new Uint8Array(reach * reach);
  let area = 0;

  for (let row = 0; row < reach; row++) {
    for (let column = 0; column < reach; column++) {
      const index = row * reach + column;
      const connected = index === 0 || (column > 0 && reachable[index - 1]) || (row > 0 && reachable[index - reach]);

      if (cells[(y + row * sy) * width + x + column * sx] || !connected) continue;

      reachable[index] = 1;
      area++;
    }
  }

  return Math.sqrt(area / (1 - Math.PI / 4));
}

function expectedRadii(cells: Uint8Array, width: number) {
  const box = maskBounds({ data: cells, width, height: cells.length / width });

  if (box.x1 < 0) return { top: 0, bottom: 0 };

  const reach = Math.floor(Math.min(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1) / 2);
  const topLeft = reachableArea(cells, width, [box.x0, box.y0, 1, 1], reach);
  const topRight = reachableArea(cells, width, [box.x1, box.y0, -1, 1], reach);
  const bottomLeft = reachableArea(cells, width, [box.x0, box.y1, 1, -1], reach);
  const bottomRight = reachableArea(cells, width, [box.x1, box.y1, -1, -1], reach);

  return { top: (topLeft + topRight) / 2, bottom: (bottomLeft + bottomRight) / 2 };
}

it('matches inward row reachability for every corner across sparse masks and edits', () => {
  const sizes = [
    [1, 1],
    [2, 9],
    [9, 2],
    [7, 11],
    [20, 15],
    [31, 23],
  ];

  for (const [width, height] of sizes) {
    for (let seed = 0; seed < 16; seed++) {
      const backing = new Uint8Array(width * height + 6).fill(255);
      const cells = backing.subarray(3, -3);

      cells.set(Uint8Array.from(cells, (_, i) => ((i * 97 + seed * 13) % 31 < seed ? 0 : 3)));

      const original = backing.slice();

      expect(cornerRadii(cells, width, 1)).toEqual(expectedRadii(cells, width));
      expect(backing).toEqual(original);
      cells.fill(0);
      expect(cornerRadii(cells, width, 1)).toEqual({ top: 0, bottom: 0 });
      cells[Math.floor(cells.length / 2)] = 1;
      expect(cornerRadii(cells, width, 1)).toEqual({ top: 0, bottom: 0 });
    }
  }
});
