import { completeBoardRules } from './boardNativeContract.mjs';
import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadDocument } from './boardKiCad.mjs';

const dimensions = [
  'trackWidthMm',
  'clearanceMm',
  'viaDiameterMm',
  'viaDrillMm',
  'copperMm',
  'epsilonR',
  'lossTangent',
];
const keys = ['source', ...dimensions, 'dielectricMaterial', 'special'];
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, maximum) => typeof value === 'string' && value.length <= maximum;
const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const fail = (code = 'board-route-requirements') => {
  throw new Error(code);
};

export function validRoutePlan(value) {
  return (
    record(value) &&
    Object.keys(value).every((key) => keys.includes(key)) &&
    bounded(value.source, 512) &&
    bounded(value.dielectricMaterial, 80) &&
    bounded(value.special, 512) &&
    dimensions.every((key) => value[key] === null || number(value[key]))
  );
}

export function checkedRoutePlan(value, rules) {
  if (!validRoutePlan(value)) fail();

  if (value.special.trim()) fail('board-route-special');

  if (!completeBoardRules(rules)) fail('board-manufacturing');

  if (
    !/^https:\/\/[^\s]{1,500}$/u.test(value.source) ||
    !dimensions.every((key) => number(value[key])) ||
    value.trackWidthMm < rules.trackWidthMm ||
    value.clearanceMm < rules.clearanceMm ||
    value.viaDrillMm < rules.drillMm ||
    value.viaDiameterMm <= value.viaDrillMm ||
    !validStackupValues(value)
  )
    fail();

  return value;
}

function validStackupValues(value) {
  return (
    value.copperMm > 0 &&
    value.copperMm <= 0.5 &&
    value.dielectricMaterial.trim().length > 0 &&
    ![...value.dielectricMaterial].some((char) => char.charCodeAt(0) < 32) &&
    value.epsilonR > 1 &&
    value.lossTangent <= 1
  );
}

export function routeStackup(plan, thickness) {
  const dielectric = Math.round((thickness - 2 * plan.copperMm) * 1e9) / 1e9;

  if (!number(thickness) || dielectric <= 0) fail();

  const layer = (name, fields) => `(layer ${JSON.stringify(name)} ${fields})`;
  const copper = `(type "copper") (thickness ${plan.copperMm})`;
  const core = `(type "core") (thickness ${dielectric}) (material ${JSON.stringify(plan.dielectricMaterial)}) (epsilon_r ${plan.epsilonR}) (loss_tangent ${plan.lossTangent})`;

  return `(stackup ${layer('F.Cu', copper)} ${layer('dielectric 1', core)} ${layer('B.Cu', copper)})`;
}

const fields = new Set([
  'session',
  'base_design',
  'placement',
  'resolution',
  'component',
  'place',
  'was_is',
  'routes',
  'parser',
  'host_cad',
  'host_version',
  'library_out',
  'padstack',
  'shape',
  'circle',
  'attach',
  'network_out',
  'net',
  'wire',
  'path',
  'via',
  'type',
  'net_number',
]);
const layer = (value) => value === 'F.Cu' || value === 'B.Cu';
const viaName = (value) =>
  typeof value === 'string' && /^Via\[0-1\]_\d{1,6}(?:\.\d{1,4})?:\d{1,6}(?:\.\d{1,4})?_um$/u.test(value);
const coordinates = (values) => values.forEach((value) => kiCadNumber(value));

function sessionNode(node) {
  if (!fields.has(node[0])) fail('board-format');

  if (node[0] === 'resolution') return sessionResolution(node);

  if (node[0] === 'base_design' && (node.length !== 2 || node[1] !== 'robot')) fail('board-format');

  if (node[0] === 'path') return sessionPath(node);

  if (node[0] === 'circle') return sessionCircle(node);

  if (node[0] === 'padstack' && !viaName(node[1])) fail('board-format');

  if (node[0] === 'via') return sessionVia(node);
}

function sessionResolution(node) {
  if (node.length !== 3 || node[1] !== 'um' || node[2] !== '10') fail('board-format');
}

function sessionVia(node) {
  if (!viaName(node[1]) || node.length !== 4) fail('board-format');

  coordinates(node.slice(2));
}

function sessionCircle(node) {
  if (node.length !== 5 || !layer(node[1]) || kiCadNumber(node[2]) <= 0 || node[3] !== '0' || node[4] !== '0')
    fail('board-format');
}

function sessionPath(node) {
  if (node.length < 5 || node.length % 2 !== 1 || !layer(node[1]) || kiCadNumber(node[2]) <= 0) fail('board-format');

  coordinates(node.slice(3));
}

export function checkedSession(text) {
  const root = readKiCadDocument(text, 'session');

  if (root[1] !== 'robot') fail('board-format');

  kiCadChild(root, 'base_design');

  const routes = kiCadChild(root, 'routes');

  kiCadChild(routes, 'resolution');
  kiCadChild(routes, 'network_out');

  const pending = [root];

  while (pending.length) {
    const node = pending.pop();

    sessionNode(node);
    pending.push(...node.filter(Array.isArray));
  }

  if (kiCadChildren(routes, 'network_out')[0].length > 4097) fail('board-format');

  return text;
}
