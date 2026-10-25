const TAU = Math.PI * 2;

function ring({ positions, center, radii, y, scale, segments }) {
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * TAU;

    positions.push(center[0] + Math.cos(a) * radii[0] * scale, y, center[2] + Math.sin(a) * radii[2] * scale);
  }
}

function stitch(indices, { below, above, segments }) {
  for (let s = 0; s < segments; s++) {
    const n = (s + 1) % segments;

    indices.push(below + s, above + s, above + n, below + s, above + n, below + n);
  }
}

function fan(indices, { apex, start, segments, flip }) {
  for (let s = 0; s < segments; s++) {
    const n = (s + 1) % segments;

    indices.push(...(flip ? [apex, start + n, start + s] : [apex, start + s, start + n]));
  }
}

export function ellipsoid(center, radii, detail = 24) {
  const segments = detail * 2;
  const positions = [center[0], center[1] - radii[1], center[2]];
  const indices = [];

  for (let r = 1; r < detail; r++) {
    const t = (r / detail) * Math.PI;

    ring({ positions, center, radii, y: center[1] - Math.cos(t) * radii[1], scale: Math.sin(t), segments });
  }

  positions.push(center[0], center[1] + radii[1], center[2]);

  const top = positions.length / 3 - 1;

  fan(indices, { apex: 0, start: 1, segments, flip: false });

  for (let r = 0; r < detail - 2; r++)
    stitch(indices, { below: 1 + r * segments, above: 1 + (r + 1) * segments, segments });

  fan(indices, { apex: top, start: 1 + (detail - 2) * segments, segments, flip: true });

  return { positions, indices };
}

export function cylinder(center, radius, height, segments = 24) {
  const positions = [center[0], center[1] - height / 2, center[2]];
  const indices = [];

  ring({ positions, center, radii: [radius, 0, radius], y: center[1] - height / 2, scale: 1, segments });
  ring({ positions, center, radii: [radius, 0, radius], y: center[1] + height / 2, scale: 1, segments });
  positions.push(center[0], center[1] + height / 2, center[2]);
  fan(indices, { apex: 0, start: 1, segments, flip: true });
  stitch(indices, { below: 1, above: 1 + segments, segments });
  fan(indices, { apex: 1 + segments * 2, start: 1 + segments, segments, flip: false });

  return { positions, indices };
}

export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  return { min, max };
}
