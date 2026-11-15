import { isScadDefinition, scadStatements } from '../../electron/cad-kernel/scadStatements.mjs';
import { HOLES_MARK, type CadLanguage, type CodeHole } from './cadCode';
import type { V3 } from './agentFrame';

const NUM = '(-?(?:\\d+(?:\\.\\d+)?)(?:e[+-]?\\d+)?)';
const VECTOR = `\\[${NUM}, ${NUM}, ${NUM}\\]`;
const SCAD = new RegExp(
  `^  translate\\(${VECTOR}\\) rotate\\(\\[0, ${NUM}, ${NUM}\\]\\) cylinder\\(d = ${NUM}, h = ${NUM}, \\$fn = 32\\);$`,
);
const REPLICAD = new RegExp(`^  \\.cut\\(makeCylinder\\(${NUM}, ${NUM}, ${VECTOR}, ${VECTOR}\\)\\)$`);

function scadHole(values: number[]): CodeHole {
  const [x, y, z, tiltDeg, turnDeg, diameter, length] = values;
  const tilt = (tiltDeg * Math.PI) / 180;
  const turn = (turnDeg * Math.PI) / 180;

  return {
    start: [x, y, z],
    direction: [Math.sin(tilt) * Math.cos(turn), Math.sin(tilt) * Math.sin(turn), Math.cos(tilt)],
    diameter,
    length,
  };
}

function replicadHole(values: number[]): CodeHole {
  return {
    start: values.slice(2, 5) as V3,
    direction: values.slice(5, 8) as V3,
    diameter: values[0] * 2,
    length: values[1],
  };
}

const uncertain = () => new Error('The generated holes have changed or use a transformed frame.');

function untransformedScad(code: string): void {
  const geometry = scadStatements(code)
    .filter((statement) => !isScadDefinition(statement))
    .map((statement) => statement.trim());
  const header = 'difference() {\n';

  if (geometry.length !== 1 || !geometry[0].startsWith(header) || !geometry[0].endsWith('\n}')) throw uncertain();

  const markerAt = geometry[0].indexOf(`\n  ${HOLES_MARK}\n`);
  const union = scadStatements(geometry[0].slice(header.length, markerAt)).map((statement) => statement.trim());

  if (markerAt < 0 || union.length !== 1 || !union[0].startsWith('union() {\n') || !union[0].endsWith('\n  }'))
    throw uncertain();
}

function untransformedReplicad(lines: string[], at: number): void {
  const exactWrapper = lines[0] === 'const basecaseBody = (() => {' && lines[at - 1] === '})();';
  const indentedBody = lines.slice(1, at - 1).every((line) => !line.trim() || line.startsWith('  '));

  if (!exactWrapper || !indentedBody) throw uncertain();
}

export function generatedHoles(language: CadLanguage, code: string): CodeHole[] {
  if (!code.includes(HOLES_MARK)) return [];

  const lines = code.trimEnd().split('\n');
  const marker = language === 'openscad' ? `  ${HOLES_MARK}` : HOLES_MARK;
  const at = lines.indexOf(marker);
  const end = language === 'openscad' ? '}' : ';';

  if (at < 0 || lines.at(-1) !== end || code.split(HOLES_MARK).length !== 2) throw uncertain();

  if (language === 'openscad') untransformedScad(code);
  else untransformedReplicad(lines, at);

  const firstCut = language === 'openscad' ? at + 1 : at + 2;

  if (language === 'replicad' && lines[at + 1] !== 'return basecaseBody') throw uncertain();

  return lines
    .slice(firstCut, -1)
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(language === 'openscad' ? SCAD : REPLICAD);

      if (!match) throw uncertain();

      const values = match.slice(1).map(Number);
      const hole = language === 'openscad' ? scadHole(values) : replicadHole(values);

      if (values.some((value) => !Number.isFinite(value)) || hole.diameter <= 0 || hole.length <= 0) throw uncertain();

      return hole;
    });
}
