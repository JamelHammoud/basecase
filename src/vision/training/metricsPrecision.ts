export function averagePrecision(matches: ReadonlyArray<{ match: number }>, support: number): number {
  let correct = matches.reduce((sum, item) => sum + Number(item.match >= 0), 0);
  let cursor = matches.length - 1;
  let best = 0;
  const samples = new Array<number>(101);

  for (let index = 100; index >= 0; index--) {
    while (cursor >= 0 && correct / support >= index / 100) {
      best = Math.max(best, correct / (cursor + 1));
      correct -= Number(matches[cursor].match >= 0);
      cursor--;
    }

    samples[index] = best;
  }

  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}
