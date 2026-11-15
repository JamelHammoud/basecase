export function* combinations<T>(items: readonly T[], count: number): Generator<T[]> {
  const length = items.length;

  if (!Number.isInteger(count) || count < 0 || count > length) return;

  const indices = Array.from({ length: count }, (_, index) => index);

  while (true) {
    yield indices.map((index) => items[index]);

    let at = count - 1;

    while (at >= 0 && indices[at] === length - count + at) at--;

    if (at < 0) return;

    indices[at]++;

    for (let next = at + 1; next < count; next++) indices[next] = indices[next - 1] + 1;
  }
}
