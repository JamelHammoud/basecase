export interface FeasibilityBodies {
  members: number[];
  leaves: number[];
  contains: (body: number, root?: number) => boolean;
}

export function feasibilityBodies(parents: ArrayLike<number>, root: number): FeasibilityBodies {
  const children = Array.from({ length: parents.length }, (): number[] => []);

  for (let body = 1; body < parents.length; body++) children[parents[body]].push(body);

  const entered = new Uint32Array(parents.length);
  const exited = new Uint32Array(parents.length);
  const stack = [0];
  let clock = 0;

  while (stack.length) {
    const body = stack.pop()!;

    if (body < 0) {
      exited[~body] = clock;

      continue;
    }

    entered[body] = clock++;
    stack.push(~body);

    for (const child of children[body]) stack.push(child);
  }

  const contains = (body: number, ancestor = root) =>
    entered[ancestor] <= entered[body] && entered[body] < exited[ancestor];
  const members = Array.from({ length: parents.length }, (_, body) => body).filter((body) => contains(body));
  const leaves = members.filter((body) => body !== root && children[body].length === 0);

  return { members, leaves, contains };
}
