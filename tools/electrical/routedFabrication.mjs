import assert from 'node:assert/strict';
import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from '../../src/wiring/boardKiCad.mjs';
import { drillFacts, gerberFacts } from './fabricationFacts.mjs';

const rounded = (value) => Number(value.toFixed(3)) || 0;
const sortedHoles = (holes) => holes.sort((a, b) => a.diameter - b.diameter || a.x - b.x || a.y - b.y);

function padHole(footprint, pad) {
  const origin = kiCadChild(footprint, 'at');
  const local = kiCadChild(pad, 'at');
  const angle = (-kiCadNumber(origin[3] ?? '0') * Math.PI) / 180;
  const x = kiCadNumber(local[1]);
  const y = kiCadNumber(local[2]);

  return {
    diameter: rounded(kiCadNumber(kiCadChild(pad, 'drill')[1])),
    x: rounded(kiCadNumber(origin[1]) + x * Math.cos(angle) - y * Math.sin(angle)),
    y: rounded(-(kiCadNumber(origin[2]) + x * Math.sin(angle) + y * Math.cos(angle))),
  };
}

export function boardDrills(pcb) {
  const board = readKiCadBoard(pcb);
  const pads = kiCadChildren(board, 'footprint').flatMap((footprint) =>
    kiCadChildren(footprint, 'pad').map((pad) => ({ type: pad[2], ...padHole(footprint, pad) })),
  );
  const vias = kiCadChildren(board, 'via').map((via) => {
    const at = kiCadChild(via, 'at');

    return {
      diameter: rounded(kiCadNumber(kiCadChild(via, 'drill')[1])),
      x: rounded(kiCadNumber(at[1])),
      y: rounded(-kiCadNumber(at[2])),
    };
  });
  const ofType = (type) => pads.filter((pad) => pad.type === type).map(({ diameter, x, y }) => ({ diameter, x, y }));

  return { plated: sortedHoles([...ofType('thru_hole'), ...vias]), unplated: sortedHoles(ofType('np_thru_hole')) };
}

export function inspectFabrication(files, pcb) {
  const board = readKiCadBoard(pcb);
  const trackLayers = kiCadChildren(board, 'segment').map((segment) => kiCadChild(segment, 'layer')[1]);

  assert.ok(kiCadChildren(board, 'via').length > 0, 'Fabrication acceptance requires through vias.');
  assert.deepEqual([...new Set(trackLayers)].sort(), ['B.Cu', 'F.Cu']);

  const nets = kiCadChildren(board, 'net')
    .map((net) => net[2])
    .filter(Boolean)
    .sort();
  const functions = {
    F_Cu: 'Copper,L1,Top',
    B_Cu: 'Copper,L2,Bot',
    f_silkscreen: 'Legend,Top',
    b_silkscreen: 'Legend,Bot',
    F_Mask: 'Soldermask,Top',
    B_Mask: 'Soldermask,Bot',
  };

  for (const [layer, expected] of Object.entries(functions))
    assert.equal(gerberFacts(files[`fabrication/robot-${layer}.gbr`]).function, expected);

  for (const layer of ['F_Cu', 'B_Cu'])
    assert.deepEqual(gerberFacts(files[`fabrication/robot-${layer}.gbr`]).nets, nets);

  const outline = gerberFacts(files['fabrication/robot-Edge_Cuts.gbr']);

  assert.deepEqual(
    [...new Set(outline.points.map((point) => point[0]))].sort((a, b) => a - b),
    [-50, 50],
  );
  assert.deepEqual(
    [...new Set(outline.points.map((point) => point[1]))].sort((a, b) => a - b),
    [-40, 40],
  );

  const holes = boardDrills(pcb);

  assert.deepEqual(sortedHoles(drillFacts(files['fabrication/robot-PTH.drl'])), holes.plated);
  assert.deepEqual(sortedHoles(drillFacts(files['fabrication/robot-NPTH.drl'])), holes.unplated);
}
