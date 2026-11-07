export function weld(soup) {
  const map = new Map();
  const positions = [];
  const indices = [];

  for (let i = 0; i < soup.length; i += 3) {
    const x = Math.round(soup[i] * 1000) / 1000;
    const y = Math.round(soup[i + 1] * 1000) / 1000;
    const z = Math.round(soup[i + 2] * 1000) / 1000;
    const key = `${x},${y},${z}`;
    let idx = map.get(key);

    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(x, y, z);
      map.set(key, idx);
    }

    indices.push(idx);
  }

  return { positions, indices };
}

export function measure(positions, indices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }

  let vol = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const [ax, ay, az] = [positions[a], positions[a + 1], positions[a + 2]];
    const [bx, by, bz] = [positions[b], positions[b + 1], positions[b + 2]];
    const [cx, cy, cz] = [positions[c], positions[c + 1], positions[c + 2]];

    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }

  const r = (v) => Math.round(v * 100) / 100;

  return {
    bbox: { min: min.map(r), max: max.map(r), size: max.map((v, i) => r(v - min[i])) },
    volume: Math.round(Math.abs(vol)),
    triangles: indices.length / 3,
  };
}
