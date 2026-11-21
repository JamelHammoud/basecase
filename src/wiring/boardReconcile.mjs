import { assertFootprintSubset, assertBoardCoordinates } from './boardFootprintSubset.mjs';
import { BoardImportError, kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from './boardKiCad.mjs';

const refuse = (code = 'board-format') => {
  throw new BoardImportError(code);
};
const topLevel = new Set([
  'version',
  'generator',
  'generator_version',
  'general',
  'paper',
  'layers',
  'setup',
  'net',
  'footprint',
  'gr_line',
  'segment',
  'via',
  'property',
  'embedded_fonts',
]);
const round = (value) => Math.round(value * 1_000_000) / 1_000_000;
const position = (node, field) => {
  const child = kiCadChild(node, field);

  const point = [kiCadNumber(child[1]), kiCadNumber(child[2])];

  if (point.some((coordinate) => Math.abs(coordinate) > 1000)) refuse();

  return point;
};
const translated = (point, delta) => point.map((value, index) => round(value - delta[index]));
const sorted = (values) => values.map((value) => JSON.stringify(value)).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const numericFields = new Set(['at', 'start', 'end', 'size', 'drill', 'thickness', 'width']);

function ordered(values) {
  return values
    .map((value) => ({ key: JSON.stringify(value), value }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => entry.value);
}

function defaultField(node) {
  if (node[0] === 'uuid') return true;

  return (
    node.length === 2 &&
    node[1] === 'no' &&
    ['embedded_fonts', 'remove_unused_layers', 'legacy_teardrops'].includes(String(node[0]))
  );
}

function canonicalAtoms(key, atoms) {
  if (key === 'net') return atoms.slice(1);

  if (key === 'attr') return [...atoms].sort();

  if (key === 'fill' && same(atoms, ['none'])) return ['no'];

  if (!numericFields.has(key)) return atoms;

  const values = atoms.map(kiCadNumber).map(round);

  if (key === 'at') return [values[0], values[1], (((values[2] ?? 0) % 360) + 360) % 360];

  return values;
}

function canonical(node) {
  if (typeof node === 'string') return node;

  const atoms = node.slice(1).filter((child) => typeof child === 'string');
  const children = node.slice(1).filter((child) => Array.isArray(child) && !defaultField(child));

  const values = canonicalAtoms(String(node[0]), atoms);

  return [node[0], values, ordered(children.map(canonical))];
}

function sourceMarker(board, expected) {
  const properties = kiCadChildren(board, 'property');
  const markers = properties.filter((property) => property[1] === 'BasecaseSource');

  if (
    !/^[a-f0-9]{64}$/u.test(expected) ||
    properties.length !== 1 ||
    markers.length !== 1 ||
    markers[0].length !== 3 ||
    markers[0][2] !== expected
  )
    refuse('board-source');
}

function supportedBoard(board) {
  assertBoardCoordinates(board);
  kiCadChildren(board, 'footprint').forEach(assertFootprintSubset);

  if (kiCadChild(board, 'version')[1] !== '20241229') refuse();

  if (board.slice(1).some((node) => !Array.isArray(node) || !topLevel.has(String(node[0])))) refuse();

  const setup = kiCadChild(board, 'setup');
  const allowedSetup = new Set([
    'pad_to_mask_clearance',
    'stackup',
    'pcbplotparams',
    'allow_soldermask_bridges_in_footprints',
    'tenting',
  ]);

  if (setup.slice(1).some((node) => !Array.isArray(node) || !allowedSetup.has(String(node[0])))) refuse();

  const plot = kiCadChildren(setup, 'pcbplotparams');

  if (plot.length > 1) refuse();

  if (plot.some((node) => kiCadChildren(node, 'outputdirectory').some((field) => field[1] !== ''))) refuse();
}

function outline(board, delta) {
  return sorted(
    kiCadChildren(board, 'gr_line').map((edge) => {
      if (kiCadChild(edge, 'layer')[1] !== 'Edge.Cuts') refuse();

      const supported = new Set(['start', 'end', 'stroke', 'layer', 'uuid']);

      if (edge.slice(1).some((child) => !Array.isArray(child) || !supported.has(String(child[0])))) refuse();

      return {
        uuid: kiCadChild(edge, 'uuid')[1],
        start: translated(position(edge, 'start'), delta),
        end: translated(position(edge, 'end'), delta),
        stroke: canonical(kiCadChild(edge, 'stroke')),
      };
    }),
  );
}

function translation(expected, imported) {
  const original = kiCadChildren(expected, 'gr_line')[0];

  if (!original || kiCadChildren(expected, 'gr_line').length !== 4) return refuse('board-outline');

  const uuid = kiCadChild(original, 'uuid')[1];
  const matching = kiCadChildren(imported, 'gr_line').filter((edge) => kiCadChild(edge, 'uuid')[1] === uuid);

  if (matching.length !== 1) return refuse('board-outline');

  const before = position(original, 'start');
  const after = position(matching[0], 'start');
  const delta = [round(after[0] - before[0]), round(after[1] - before[1])];

  if (!same(outline(expected, [0, 0]), outline(imported, delta))) refuse('board-outline');

  return delta;
}

function footprintIdentity(footprint, delta) {
  const ignored = new Set(['at', 'uuid', 'property', 'pad', 'version', 'generator', 'generator_version']);
  const properties = kiCadChildren(footprint, 'property')
    .filter((property) => property[2] !== '')
    .map(canonical);
  const angle = kiCadChild(footprint, 'at')[3] ?? '0';

  return {
    library: footprint[1],
    at: translated(position(footprint, 'at'), delta),
    angle: ((kiCadNumber(angle) % 360) + 360) % 360,
    properties: sorted(properties),
    shape: sorted(
      footprint
        .slice(2)
        .filter((node) => !Array.isArray(node) || (!ignored.has(String(node[0])) && !defaultField(node)))
        .map(canonical),
    ),
  };
}

function checkFootprint(before, after, delta) {
  const mounting = kiCadChildren(before, 'property').some(
    (property) => property[1] === 'Reference' && String(property[2]).startsWith('H_'),
  );
  const code = mounting ? 'board-hole' : 'board-mapping';

  if (!same(footprintIdentity(before, [0, 0]), footprintIdentity(after, delta))) refuse(code);

  const holes = (node) => kiCadChildren(node, 'pad').filter((pad) => pad[2] === 'np_thru_hole');
  const pads = (node) => kiCadChildren(node, 'pad').filter((pad) => pad[2] !== 'np_thru_hole');

  if (!same(sorted(holes(before).map(canonical)), sorted(holes(after).map(canonical)))) refuse('board-hole');

  if (!same(sorted(pads(before).map(canonical)), sorted(pads(after).map(canonical)))) refuse('board-mapping');
}

function checkFootprints(expected, imported, delta) {
  const before = kiCadChildren(expected, 'footprint');
  const after = kiCadChildren(imported, 'footprint');
  const indexed = new Map(after.map((node) => [kiCadChild(node, 'uuid')[1], node]));

  if (before.length !== after.length || indexed.size !== after.length) refuse('board-mapping');

  for (const original of before) {
    const matching = indexed.get(kiCadChild(original, 'uuid')[1]);

    if (!matching) return refuse('board-mapping');

    checkFootprint(original, matching, delta);
  }
}

function layerNames(board) {
  return sorted(
    kiCadChild(board, 'layers')
      .slice(1)
      .map((layer) => {
        if (!Array.isArray(layer)) return refuse();

        return layer.slice(1);
      })
      .filter((layer) => !same(layer, ['Margin', 'user'])),
  );
}

function checkNetNames(expected, imported) {
  const original = new Set(kiCadChildren(expected, 'net').map((net) => String(net[2])));
  const actual = kiCadChildren(imported, 'net');
  const required = new Set(
    kiCadChildren(expected, 'footprint').flatMap((footprint) =>
      kiCadChildren(footprint, 'pad').flatMap((pad) => kiCadChildren(pad, 'net').map((net) => String(net[2]))),
    ),
  );
  const names = new Set(actual.map((net) => String(net[2])));
  const ids = new Set(actual.map((net) => String(net[1])));

  if (
    names.size !== actual.length ||
    ids.size !== actual.length ||
    actual.some((net) => net.length !== 3 || !original.has(String(net[2]))) ||
    [...required].some((name) => !names.has(name))
  )
    refuse('board-mapping');

  checkPadNets(imported);
}

function checkPadNets(board) {
  const nets = new Map(kiCadChildren(board, 'net').map((net) => [String(net[1]), net[2]]));
  const padNets = kiCadChildren(board, 'footprint').flatMap((footprint) =>
    kiCadChildren(footprint, 'pad').flatMap((pad) => kiCadChildren(pad, 'net')),
  );

  if (padNets.some((net) => net.length !== 3 || nets.get(String(net[1])) !== net[2])) refuse('board-mapping');
}

function copperPoint(object, key) {
  if (kiCadChild(object, key).length !== 3) refuse();

  return position(object, key);
}

function copperDimension(object, key) {
  const field = kiCadChild(object, key);

  if (field.length !== 2) refuse();

  const value = kiCadNumber(field[1]);

  if (value > 100) refuse();

  return value;
}

function checkSegment(object) {
  const start = copperPoint(object, 'start');
  const end = copperPoint(object, 'end');

  if (copperDimension(object, 'width') <= 0 || same(start, end)) refuse();
}

function checkVia(object) {
  copperPoint(object, 'at');

  const size = copperDimension(object, 'size');
  const drill = copperDimension(object, 'drill');

  if (drill <= 0 || size <= drill) refuse();
}

function checkCopper(object, type, nets) {
  const fields =
    type === 'segment'
      ? ['start', 'end', 'width', 'layer', 'net', 'uuid', 'locked']
      : ['at', 'size', 'drill', 'layers', 'net', 'uuid', 'locked', 'tenting'];

  if (object.slice(1).some((node) => !Array.isArray(node) || !fields.includes(String(node[0])))) refuse();

  const net = kiCadChild(object, 'net');

  if (net.length !== 2 || !nets.has(String(net[1]))) refuse('board-mapping');

  if (
    kiCadChildren(object, 'tenting').some((field) => field.slice(1).some((side) => side !== 'front' && side !== 'back'))
  )
    refuse();

  const layer = kiCadChild(object, type === 'segment' ? 'layer' : 'layers').slice(1);

  if (
    (type === 'segment' && layer.length !== 1) ||
    layer.some((name) => name !== 'F.Cu' && name !== 'B.Cu') ||
    (type === 'via' && !same(layer, ['F.Cu', 'B.Cu']))
  )
    refuse();

  if (type === 'segment') return checkSegment(object);

  checkVia(object);
}

function copper(board, type, nets) {
  const objects = kiCadChildren(board, type);

  objects.forEach((object) => checkCopper(object, type, nets));

  return objects.length;
}

export function reconcileRoutedBoard(input) {
  try {
    const expected = readKiCadBoard(input.expected);
    const imported = readKiCadBoard(input.imported);

    supportedBoard(expected);
    supportedBoard(imported);
    sourceMarker(expected, input.sourceFingerprint);
    sourceMarker(imported, input.sourceFingerprint);

    if (!same(layerNames(expected), layerNames(imported))) refuse();

    if (!same(canonical(kiCadChild(expected, 'general')), canonical(kiCadChild(imported, 'general'))))
      refuse('board-geometry');

    checkNetNames(expected, imported);

    const delta = translation(expected, imported);

    checkFootprints(expected, imported, delta);

    const nets = new Set(
      kiCadChildren(imported, 'net')
        .map((net) => String(net[1]))
        .filter((id) => id !== '0'),
    );

    return {
      accepted: true,
      translationMm: delta,
      segments: copper(imported, 'segment', nets),
      vias: copper(imported, 'via', nets),
    };
  } catch (error) {
    if (error instanceof BoardImportError) return { accepted: false, code: error.code };

    throw error;
  }
}
