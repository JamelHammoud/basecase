export function weldImportedMesh(soup: Float32Array, sourceColors?: Float32Array) {
  if (soup.length % 9 || soup.some((value) => !Number.isFinite(value)))
    throw new Error('Mesh needs complete triangles with finite coordinates.');

  if (sourceColors && (sourceColors.length !== soup.length || sourceColors.some((value) => !Number.isFinite(value))))
    throw new Error('Mesh colors need one finite RGB value per vertex.');

  const lookup = new Map<string, number>();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices = new Uint32Array(soup.length / 3);

  for (let offset = 0; offset < soup.length; offset += 3) {
    const point = `${soup[offset]},${soup[offset + 1]},${soup[offset + 2]}`;
    const key = sourceColors
      ? `${point}|${sourceColors[offset]},${sourceColors[offset + 1]},${sourceColors[offset + 2]}`
      : point;
    let index = lookup.get(key);

    if (index === undefined) {
      index = positions.length / 3;
      lookup.set(key, index);
      positions.push(soup[offset], soup[offset + 1], soup[offset + 2]);

      colors.push(...(sourceColors ? [sourceColors[offset], sourceColors[offset + 1], sourceColors[offset + 2]] : []));
    }

    indices[offset / 3] = index;
  }

  return {
    positions: new Float32Array(positions),
    indices,
    colors: sourceColors ? new Float32Array(colors) : undefined,
  };
}
