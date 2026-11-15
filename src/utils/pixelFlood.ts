interface PixelFlood {
  width: number;
  height: number;
  starts: Iterable<number>;
  visited: Uint8Array;
  blocked: (pixel: number) => boolean;
  visit?: (pixel: number) => void;
}

export function borderPixels(width: number, height: number): number[] {
  const border: number[] = [];

  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);

  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);

  return border;
}

export function floodPixels({ width, height, starts, visited, blocked, visit }: PixelFlood): void {
  const stack: number[] = [];
  const offer = (pixel: number) => {
    if (visited[pixel]) return;

    visited[pixel] = 1;

    if (!blocked(pixel)) stack.push(pixel);
  };

  for (const pixel of starts) offer(pixel);

  while (stack.length) {
    const pixel = stack.pop()!;
    const x = pixel % width;

    visit?.(pixel);

    if (x > 0) offer(pixel - 1);

    if (x < width - 1) offer(pixel + 1);

    if (pixel >= width) offer(pixel - width);

    if (pixel < width * (height - 1)) offer(pixel + width);
  }
}
