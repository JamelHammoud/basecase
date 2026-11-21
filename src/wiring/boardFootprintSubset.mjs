import { BoardImportError, kiCadChild, kiCadChildren, kiCadNumber } from './boardKiCad.mjs';

const refuse = () => {
  throw new BoardImportError('board-format');
};
const allowed = (node, keys, offset = 1) => {
  if (node.slice(offset).some((field) => !Array.isArray(field) || !keys.includes(field[0]))) refuse();
};
const size = (node, key) => {
  const value = kiCadChild(node, key);
  const numbers = value.slice(1).map(kiCadNumber);

  if (numbers.some((number) => number <= 0 || number > 100)) refuse();

  return numbers;
};

export function assertBoardCoordinates(node) {
  const point = ['at', 'start', 'end', 'xy'].includes(node[0]);
  const dimension = ['size', 'drill', 'width', 'thickness'].includes(node[0]);

  if (point && (Math.abs(kiCadNumber(node[1])) > 1000 || Math.abs(kiCadNumber(node[2])) > 1000)) refuse();

  if (dimension && node.slice(1).some((value) => Math.abs(kiCadNumber(value)) > 100)) refuse();

  for (const child of node.filter(Array.isArray)) assertBoardCoordinates(child);
}

export function assertFootprintSubset(footprint) {
  allowed(
    footprint,
    [
      'version',
      'generator',
      'generator_version',
      'layer',
      'uuid',
      'at',
      'property',
      'path',
      'attr',
      'fp_rect',
      'pad',
      'embedded_fonts',
      'descr',
      'locked',
    ],
    2,
  );
  assertBoardCoordinates(footprint);

  if (kiCadChildren(footprint, 'property').some((field) => typeof field[2] !== 'string' || field[2].length > 2048))
    refuse();

  for (const pad of kiCadChildren(footprint, 'pad')) assertPad(pad);

  for (const rectangle of kiCadChildren(footprint, 'fp_rect')) {
    allowed(rectangle, ['start', 'end', 'stroke', 'fill', 'layer', 'uuid']);

    const layer = kiCadChild(rectangle, 'layer')[1];

    if (!['F.CrtYd', 'B.CrtYd'].includes(layer)) refuse();

    size(kiCadChild(rectangle, 'stroke'), 'width');
  }
}

function assertPad(pad) {
  if (!['thru_hole', 'np_thru_hole'].includes(pad[2]) || pad[3] !== 'circle') refuse();

  allowed(pad, ['at', 'size', 'drill', 'layers', 'net', 'uuid', 'remove_unused_layers'], 4);

  const diameter = size(pad, 'size');
  const drill = size(pad, 'drill');
  const layers = kiCadChild(pad, 'layers').slice(1);

  if (diameter.length !== 2 || diameter[0] !== diameter[1] || drill.length !== 1) refuse();

  if (JSON.stringify(layers) !== '["*.Cu","*.Mask"]') refuse();
}
