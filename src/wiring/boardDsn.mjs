import { readKiCadDocument, kiCadChild, kiCadChildren, kiCadNumber } from './boardKiCad.mjs';

const names = new Set([
  'pcb',
  'parser',
  'string_quote',
  'space_in_quoted_tokens',
  'host_cad',
  'host_version',
  'resolution',
  'unit',
  'structure',
  'layer',
  'type',
  'property',
  'index',
  'boundary',
  'path',
  'via',
  'rule',
  'width',
  'clearance',
  'keepout',
  'rect',
  'polygon',
  'circle',
  'placement',
  'component',
  'place',
  'PN',
  'library',
  'image',
  'outline',
  'pin',
  'padstack',
  'shape',
  'attach',
  'network',
  'net',
  'pins',
  'class',
  'circuit',
  'use_via',
  'wiring',
  'wire',
]);
const fail = () => {
  throw new Error('board-format');
};

export function checkedDsn(text) {
  const parsed = readKiCadDocument(text.replace('(string_quote ")', '(string_quote double)'), 'pcb');

  if (parsed[1] !== 'robot.dsn') fail();

  const parser = kiCadChild(parsed, 'parser');
  const resolution = kiCadChild(parsed, 'resolution');

  if (kiCadChild(parser, 'host_version')[1] !== '9.0.6' || resolution[1] !== 'um' || resolution[2] !== '10') fail();

  if (kiCadChild(parsed, 'unit')[1] !== 'um') fail();

  const layers = kiCadChildren(kiCadChild(parsed, 'structure'), 'layer').map((node) => node[1]);

  if (JSON.stringify(layers) !== '["F.Cu","B.Cu"]') fail();

  const pending = [parsed];

  while (pending.length) {
    const node = pending.pop();

    if (!names.has(node[0])) fail();

    checkGeometry(node);
    pending.push(...node.filter(Array.isArray));
  }

  return text;
}

function checkGeometry(node) {
  if (node[0] === 'path' && !['pcb', 'signal', 'F.Cu', 'B.Cu'].includes(node[1])) fail();

  if (node[0] === 'path') node.slice(2).forEach(kiCadNumber);

  if (['rect', 'circle', 'polygon'].includes(node[0])) node.slice(2).forEach(kiCadNumber);
}
