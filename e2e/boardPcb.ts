type Form = Array<string | Form>;

function parse(text: string): Form {
  const root: Form = [];
  const stack = [root];

  for (const token of text.match(/"(?:\\.|[^"\\])*"|[()]|[^\s()]+/g) ?? []) {
    const current = stack.at(-1)!;

    if (token === '(') {
      const next: Form = [];

      current.push(next);
      stack.push(next);

      continue;
    }

    if (token === ')' && stack.length === 1) throw new Error('Unbalanced PCB form');

    if (token === ')') {
      stack.pop();

      continue;
    }

    current.push(token.startsWith('"') ? JSON.parse(token) : token);
  }

  if (stack.length !== 1) throw new Error('Unclosed PCB form');

  return root;
}

const children = (form: Form, name: string): Form[] =>
  form.filter((value): value is Form => Array.isArray(value) && value[0] === name);
const point = (form: Form, name: string) => children(form, name)[0].slice(1, 3).map(Number);

export function boardPcbFacts(text: string) {
  const board = children(parse(text), 'kicad_pcb')[0];
  const footprints = children(board, 'footprint').map((footprint) => ({
    reference: children(footprint, 'property').find((property) => property[1] === 'Reference')?.[2],
    pads: children(footprint, 'pad').map((pad) => ({
      number: pad[1],
      type: pad[2],
      drill: Number(children(pad, 'drill')[0][1]),
      net: children(pad, 'net')[0]?.[2],
    })),
  }));

  return {
    outline: children(board, 'gr_line').map((edge) => ({ start: point(edge, 'start'), end: point(edge, 'end') })),
    thickness: Number(children(children(board, 'general')[0], 'thickness')[0][1]),
    footprints,
    holes: footprints.flatMap((footprint) => footprint.pads.filter((pad) => pad.type === 'np_thru_hole')),
  };
}
