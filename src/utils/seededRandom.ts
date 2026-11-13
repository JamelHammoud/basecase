export type Random = () => number;

export function seededRandom(seedHex: string): Random {
  const words = [0, 1, 2, 3].map((i) => parseInt(seedHex.slice(i * 8, i * 8 + 8), 16) >>> 0);
  let [a, b, c, d] = words;

  return () => {
    const t = (((a + b) >>> 0) + d) >>> 0;

    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;

    return t / 4294967296;
  };
}
