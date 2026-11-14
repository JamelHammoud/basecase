import assert from 'node:assert/strict';

function expectedBounds(position) {
  const corners = [-100, 100].flatMap((dx) =>
    [-50, 50].flatMap((dy) =>
      [-50, 50].map((dz) => [
        320 + ((position[0] + dx) * 320) / (1000 - position[2] - dz),
        240 - ((position[1] + dy - 150) * 320) / (1000 - position[2] - dz),
      ]),
    ),
  );

  return [
    Math.min(...corners.map(([x]) => x)),
    Math.min(...corners.map(([, y]) => y)),
    Math.max(...corners.map(([x]) => x)),
    Math.max(...corners.map(([, y]) => y)),
  ];
}

export function assertTrainingImagesBudget(result) {
  assert.equal(result.frames, 1000);
  assert.deepEqual([result.width, result.height], [640, 480]);
  assert.ok(Number.isFinite(result.milliseconds) && result.milliseconds >= 0 && result.milliseconds < 120000);
  assert.equal(result.measured.length, 500);

  for (const { position, bounds } of result.measured) {
    assert.ok(bounds, `No visible bounds at ${JSON.stringify(position)}`);
    assert.equal(bounds.length, 4);

    for (const [edge, value] of expectedBounds(position).entries()) {
      assert.ok(Math.abs(bounds[edge] - value) <= 1, `Box edge ${edge} differs at ${JSON.stringify(position)}`);
    }
  }
}
