export function drillFacts(text) {
  const tools = new Map([...text.matchAll(/^T(\d+)C([\d.]+)$/gmu)].map((match) => [match[1], Number(match[2])]));
  const holes = [];
  let tool;

  for (const line of text.split(/\r?\n/u)) {
    const selected = /^T(\d+)$/u.exec(line);
    const point = /^X(-?[\d.]+)Y(-?[\d.]+)$/u.exec(line);

    if (selected) tool = selected[1];

    if (point) holes.push({ diameter: tools.get(tool), x: Number(point[1]), y: Number(point[2]) });
  }

  return holes;
}

export function gerberFacts(text) {
  return {
    function: /%TF.FileFunction,([^*]+)\*%/u.exec(text)?.[1],
    nets: [...new Set([...text.matchAll(/%TO.N,([^*]+)\*%/gu)].map((match) => match[1]))].sort(),
    points: [...text.matchAll(/^X(-?\d+)Y(-?\d+)D0[123]\*$/gmu)].map((match) => [
      Number(match[1]) / 1_000_000,
      Number(match[2]) / 1_000_000,
    ]),
  };
}
