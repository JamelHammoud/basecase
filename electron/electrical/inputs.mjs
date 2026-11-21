import { validCopperExclusions } from '../../src/wiring/boardCopperExclusions.mjs';
import { assertFootprintSubset, assertBoardCoordinates } from '../../src/wiring/boardFootprintSubset.mjs';
import { readKiCadDocument, kiCadChild, kiCadChildren } from '../../src/wiring/boardKiCad.mjs';
import { reconcileRoutedBoard } from '../../src/wiring/boardReconcile.mjs';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';

const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const boundedText = (value, max) => typeof value === 'string' && value.length <= max;

export function boundedBoardRequest(value) {
  if (!value || typeof value !== 'object') throw new Error('board-format');

  boundedFootprints(value.footprints);

  boundedRequestMetadata(value);

  const keys = [
    'id',
    'expected',
    'pcb',
    'schematic',
    'footprints',
    'key',
    'sourceFingerprint',
    'boardHash',
    'geometryFingerprint',
    'rules',
    'mechanicalIssues',
    'copperExclusions',
  ];

  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error('board-format');

  if (
    !boundedText(value.id, 80) ||
    !/^[a-zA-Z0-9_-]+$/u.test(value.id) ||
    !boundedText(value.pcb, 8 * 1024 * 1024) ||
    !boundedText(value.expected, 2 * 1024 * 1024) ||
    !boundedText(value.schematic, 4 * 1024 * 1024) ||
    ![value.sourceFingerprint, value.boardHash, value.geometryFingerprint].every(hash)
  )
    throw new Error('board-format');

  if (
    !Array.isArray(value.mechanicalIssues) ||
    value.mechanicalIssues.length > 1024 ||
    value.mechanicalIssues.some((code) => typeof code !== 'string' || !/^board-[a-z-]{1,60}$/u.test(code))
  )
    throw new Error('board-format');

  boundedRules(value.rules);
}

function boundedRules(rules) {
  if (rules && Object.keys(rules).some((key) => !['source', 'clearanceMm', 'trackWidthMm', 'drillMm'].includes(key)))
    throw new Error('board-format');

  if (
    rules &&
    (!boundedText(rules.source, 512) ||
      [rules.clearanceMm, rules.trackWidthMm, rules.drillMm].some(
        (number) =>
          number !== null && (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > 10),
      ))
  )
    throw new Error('board-format');
}

function boundedFootprints(footprints) {
  if (!footprints || typeof footprints !== 'object' || Array.isArray(footprints)) throw new Error('board-format');

  const entries = Object.entries(footprints);

  if (
    entries.length > 256 ||
    entries.some(
      ([name, text]) =>
        !/^[A-Za-z0-9_.-]{1,120}\.kicad_mod$/u.test(name) || name.includes('..') || !boundedText(text, 128 * 1024),
    )
  )
    throw new Error('board-format');

  let bytes = 0;

  for (const [, text] of entries) {
    bytes += Buffer.byteLength(text);

    if (bytes > 2 * 1024 * 1024) throw new Error('board-format');
  }

  return entries;
}

function checkedFootprints(footprints) {
  for (const [, text] of boundedFootprints(footprints)) assertFootprintSubset(readKiCadDocument(text, 'footprint'));
}

export async function checkedBoardRequest(value) {
  boundedBoardRequest(value);
  checkedFootprints(value.footprints);

  if (
    Buffer.byteLength(value.pcb) > 8 * 1024 * 1024 ||
    Buffer.byteLength(value.expected) > 2 * 1024 * 1024 ||
    Buffer.byteLength(value.schematic) > 4 * 1024 * 1024
  )
    throw new Error('board-format');

  if ((await boardDigest(value.pcb)) !== value.boardHash) throw new Error('board-format');

  const compared = reconcileRoutedBoard({
    expected: value.expected,
    imported: value.pcb,
    sourceFingerprint: value.sourceFingerprint,
  });

  if (!compared.accepted) throw new Error(compared.code);

  const schematic = readKiCadDocument(value.schematic, 'kicad_sch');

  assertBoardCoordinates(schematic);

  const supported = new Set([
    'version',
    'generator',
    'generator_version',
    'uuid',
    'paper',
    'lib_symbols',
    'junction',
    'wire',
    'label',
    'text',
    'symbol',
    'no_connect',
    'sheet_instances',
    'embedded_fonts',
  ]);

  if (schematic.slice(1).some((node) => !Array.isArray(node) || !supported.has(String(node[0]))))
    throw new Error('board-format');

  const library = kiCadChild(schematic, 'lib_symbols');
  const symbols = new Set(kiCadChildren(library, 'symbol').map((symbol) => symbol[1]));
  const instances = kiCadChildren(schematic, 'symbol');

  if (instances.some((symbol) => !symbols.has(kiCadChild(symbol, 'lib_id')[1]))) throw new Error('board-format');

  return value;
}

export { boardProject as nativeProject } from '../../src/wiring/boardNativeContract.mjs';

function boundedRequestMetadata(value) {
  if (value.key !== undefined && !hash(value.key)) throw new Error('board-format');

  if (value.copperExclusions !== undefined && !validCopperExclusions(value.copperExclusions))
    throw new Error('board-format');
}
