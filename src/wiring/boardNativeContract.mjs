import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from './boardKiCad.mjs';

export const BOARD_CLI_VERSION = '9.0.6';
export const BOARD_OUTPUT_LIMIT = 16 * 1024 * 1024;

export async function boardDigest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const boardEvidenceKey = (request) =>
  boardDigest(
    JSON.stringify([
      request.boardHash,
      request.sourceFingerprint,
      request.geometryFingerprint,
      BOARD_CLI_VERSION,
      request.rules?.source ?? null,
      request.rules?.clearanceMm ?? null,
      request.rules?.trackWidthMm ?? null,
      request.rules?.drillMm ?? null,
      request.mechanicalIssues,
      request.copperExclusions ?? [],
      request.schematic,
      request.expected,
      Object.entries(request.footprints ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  );

export function completeBoardRules(rules) {
  return (
    !!rules &&
    typeof rules.source === 'string' &&
    /^https:\/\/[^\s]{1,500}$/u.test(rules.source) &&
    [rules.clearanceMm, rules.trackWidthMm, rules.drillMm].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10,
    )
  );
}

export function explicitBoardStackup(pcb) {
  try {
    const board = readKiCadBoard(pcb);
    const setup = kiCadChild(board, 'setup');
    const layers = kiCadChildren(kiCadChild(setup, 'stackup'), 'layer');
    const copper = layers.filter((layer) => kiCadChild(layer, 'type')[1] === 'copper');
    const names = copper.map((layer) => layer[1]).sort();
    const dielectrics = layers.filter((layer) => ['core', 'prepreg'].includes(kiCadChild(layer, 'type')[1]));
    const thicknesses = copper.map((layer) => kiCadNumber(kiCadChild(layer, 'thickness')[1]));
    const total = layers.reduce((sum, layer) => sum + kiCadNumber(kiCadChild(layer, 'thickness')[1]), 0);
    const thickness = kiCadNumber(
      kiCadChild(board, 'general').find((node) => Array.isArray(node) && node[0] === 'thickness')?.[1],
    );

    return (
      JSON.stringify(names) === '["B.Cu","F.Cu"]' &&
      layers.length === 3 &&
      dielectrics.length === 1 &&
      explicitDielectric(dielectrics[0]) &&
      thicknesses.every((value) => value > 0 && value <= 0.5) &&
      Math.abs(total - thickness) < 0.000001
    );
  } catch {
    return false;
  }
}

function explicitDielectric(layer) {
  const material = kiCadChild(layer, 'material')[1];
  const thickness = kiCadNumber(kiCadChild(layer, 'thickness')[1]);
  const permittivity = kiCadNumber(kiCadChild(layer, 'epsilon_r')[1]);
  const loss = kiCadNumber(kiCadChild(layer, 'loss_tangent')[1]);

  return (
    thickness > 0 &&
    thickness <= 100 &&
    typeof material === 'string' &&
    material.length > 0 &&
    material.length <= 80 &&
    permittivity > 1 &&
    permittivity <= 100 &&
    loss >= 0 &&
    loss <= 1
  );
}

export function boardProject(rules) {
  const minimum = (value) => (typeof value === 'number' && value > 0 ? value : undefined);

  return JSON.stringify({
    meta: { filename: 'robot.kicad_pro', version: 1 },
    board: {
      design_settings: {
        rules: {
          min_clearance: minimum(rules?.clearanceMm),
          min_track_width: minimum(rules?.trackWidthMm),
          min_through_hole_diameter: minimum(rules?.drillMm),
          min_via_drill: minimum(rules?.drillMm),
        },
      },
    },
  });
}

export function connectedBoardReport(result) {
  if (result.version !== BOARD_CLI_VERSION || !result.report || result.issues.includes('board-unrouted')) return false;

  try {
    const value = JSON.parse(result.report);

    return (
      value.kicad_version === BOARD_CLI_VERSION &&
      ['violations', 'unconnected_items', 'schematic_parity'].every(
        (key) => Array.isArray(value[key]) && value[key].length === 0,
      )
    );
  } catch {
    return false;
  }
}
