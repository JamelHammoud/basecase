import { isScadDefinition, scadStatements } from './scadStatements';
import type { V3 } from './agentFrame';

export type CadLanguage = 'openscad' | 'replicad';

export const HOLES_MARK = '// basecase: holes';

const MIRROR_MARK = '// basecase: mirror';

export interface CodeHole {
  start: V3;
  direction: V3;
  diameter: number;
  length: number;
}

const n = (v: number) => `${Math.round(v * 1000) / 1000}`;
const vec = (v: V3) => `[${v.map(n).join(', ')}]`;
const indent = (text: string) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');

function splitScad(code: string) {
  const statements = scadStatements(code);

  return {
    defs: statements.filter(isScadDefinition).map((s) => s.trim()),
    body: statements.filter((s) => !isScadDefinition(s)).map((s) => s.trim()),
  };
}

function wrapScad(code: string, open: string): string {
  const { defs, body } = splitScad(code);

  return [...defs, `${open} {`, indent(body.join('\n')), '}'].join('\n');
}

function scadWithHoles(code: string, lines: string): string {
  const { defs, body } = splitScad(code);

  return [
    ...defs,
    'difference() {',
    '  union() {',
    indent(indent(body.join('\n'))),
    '  }',
    `  ${HOLES_MARK}`,
    lines,
    '}',
  ].join('\n');
}

const iife = (code: string, name: string) => `const ${name} = (() => {\n${indent(code.trim())}\n})();`;

const MIRROR_PLANE = ['YZ', 'XZ', 'XY'];

export function mirrorCode(language: CadLanguage, code: string, cadAxis: 0 | 1 | 2): string {
  const mark = `${MIRROR_MARK} ${'xyz'[cadAxis]}`;

  if (language === 'replicad')
    return `${mark}\n${iife(code, 'basecaseMirrored')}\nreturn basecaseMirrored.mirror("${MIRROR_PLANE[cadAxis]}", [0, 0, 0]);`;

  const normal = [0, 0, 0];

  normal[cadAxis] = 1;

  return `${mark}\n${wrapScad(code, `mirror([${normal.join(', ')}])`)}`;
}

export function mirroredAxis(code: string): 0 | 1 | 2 | null {
  const m = code.match(/\/\/ basecase: mirror ([xyz])/);

  return m ? ('xyz'.indexOf(m[1]) as 0 | 1 | 2) : null;
}

function scadHole(h: CodeHole): string {
  const [dx, dy, dz] = h.direction;
  const tilt = (Math.acos(Math.max(-1, Math.min(1, dz))) * 180) / Math.PI;
  const turn = (Math.atan2(dy, dx) * 180) / Math.PI;

  return `  translate(${vec(h.start)}) rotate([0, ${n(tilt)}, ${n(turn)}]) cylinder(d = ${n(h.diameter)}, h = ${n(h.length)}, $fn = 32);`;
}

const replicadHole = (h: CodeHole) =>
  `  .cut(makeCylinder(${n(h.diameter / 2)}, ${n(h.length)}, ${vec(h.start)}, ${vec(h.direction)}))`;

function insertBefore(code: string, token: string, text: string): string {
  const at = code.lastIndexOf(token);

  return `${code.slice(0, at)}\n${text}${code.slice(at)}`;
}

function replicadWithHoles(code: string, holes: CodeHole[]): string {
  const cuts = holes.map(replicadHole).join('\n');

  if (code.includes(HOLES_MARK)) return insertBefore(code, '\n;', cuts);

  return `${iife(code, 'basecaseBody')}\n${HOLES_MARK}\nreturn basecaseBody\n${cuts}\n;`;
}

export function addHoles(language: CadLanguage, code: string, holes: CodeHole[]): string {
  if (!holes.length) return code;

  if (language === 'replicad') return replicadWithHoles(code, holes);

  const lines = holes.map(scadHole).join('\n');

  return code.includes(HOLES_MARK) ? insertBefore(code, '\n}', lines) : scadWithHoles(code, lines);
}
