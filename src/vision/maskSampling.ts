interface Size {
  width: number;
  height: number;
}

export function nearestMaskColumns(source: number, target: number): Uint32Array {
  const columns = new Uint32Array(target);

  for (let x = 0; x < target; x++) columns[x] = Math.min(source - 1, Math.floor(((x + 0.5) * source) / target));

  return columns;
}

const COLUMN_BLOCK = 4096;

function interpolationColumns(source: number, target: number, start: number) {
  const length = Math.min(COLUMN_BLOCK, target - start);
  const low = new Float64Array(length);
  const high = new Float64Array(length);
  const fraction = new Float64Array(length);

  for (let i = 0; i < length; i++) {
    const position = ((start + i + 0.5) * source) / target - 0.5;
    const left = Math.max(0, Math.min(source - 1, Math.floor(position)));

    low[i] = left;
    high[i] = Math.min(source - 1, left + 1);
    fraction[i] = Math.max(0, position - left);
  }

  return { low, high, fraction };
}

export function bilinearMaskPixels(data: Float32Array, source: Size, target: Size): Uint8Array {
  const pixels = new Uint8Array(target.width * target.height);

  for (let start = 0; start < target.width; start += COLUMN_BLOCK)
    interpolateBlock({ data, source, target, pixels, start });

  return pixels;
}

function interpolateBlock(input: {
  data: Float32Array;
  source: Size;
  target: Size;
  pixels: Uint8Array;
  start: number;
}) {
  const { data, source, target, pixels, start } = input;
  const columns = interpolationColumns(source.width, target.width, start);

  for (let y = 0; y < target.height; y++) {
    const position = ((y + 0.5) * source.height) / target.height - 0.5;
    const row = Math.max(0, Math.min(source.height - 1, Math.floor(position)));
    const top = row * source.width;
    const bottom = Math.min(source.height - 1, row + 1) * source.width;
    const dy = Math.max(0, position - row);

    for (let x = 0; x < columns.low.length; x++) {
      const left = columns.low[x];
      const right = columns.high[x];
      const dx = columns.fraction[x];
      const value =
        data[top + left] * (1 - dx) * (1 - dy) +
        data[top + right] * dx * (1 - dy) +
        data[bottom + left] * (1 - dx) * dy +
        data[bottom + right] * dx * dy;

      pixels[y * target.width + start + x] = Number(value > 0);
    }
  }
}
