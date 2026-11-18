import { expect, it } from 'vitest';
import { inspectFabrication } from './routedFabrication.mjs';

const rotations = [
  { angle: 0, point: [12, -23] },
  { angle: -90, point: [7, -22] },
  { angle: -180, point: [8, -17] },
  { angle: -270, point: [13, -18] },
];

function fabrication({ angle, point }) {
  const pcb = `(kicad_pcb (net 0 "") (net 1 "/DATA_1")
    (footprint "header" (at 10 20 ${angle})
      (pad "1" thru_hole circle (at 2 3) (drill 0.9501)))
    (footprint "mount" (at -44.1234 -34.5678)
      (pad "" np_thru_hole circle (at 0 0) (drill 3.2001)))
    (segment (start 0 0) (end 1.2344 2.3456) (layer "F.Cu"))
    (segment (start 1.2344 2.3456) (end 3 4) (layer "B.Cu"))
    (via (at 1.2344 2.3456) (drill 0.4001)))`;
  const layers = {
    F_Cu: 'Copper,L1,Top',
    B_Cu: 'Copper,L2,Bot',
    f_silkscreen: 'Legend,Top',
    b_silkscreen: 'Legend,Bot',
    F_Mask: 'Soldermask,Top',
    B_Mask: 'Soldermask,Bot',
  };
  const files = Object.fromEntries(
    Object.entries(layers).map(([layer, value]) => [
      `fabrication/robot-${layer}.gbr`,
      `%TF.FileFunction,${value}*%\n%TO.N,/DATA_1*%`,
    ]),
  );

  files['fabrication/robot-Edge_Cuts.gbr'] = 'X-50000000Y-40000000D01*\nX50000000Y40000000D01*';
  files['fabrication/robot-PTH.drl'] =
    `T01C0.950\r\nT02C0.400\r\nT01\r\nX${point[0]}Y${point[1]}\r\nT02\r\nX1.234Y-2.346`;
  files['fabrication/robot-NPTH.drl'] = 'T01C3.200\nT01\nX-44.123Y34.568';

  return { files, pcb };
}

it.each(rotations)(
  'compares rotated source pads and through vias with native drill coordinates at $angle',
  (variant) => {
    const { files, pcb } = fabrication(variant);

    expect(() => inspectFabrication(files, pcb)).not.toThrow();
  },
);

it.each([
  { file: 'robot-PTH.drl', from: 'X1.234Y-2.346', to: 'X1.234Y-2.347' },
  { file: 'robot-PTH.drl', from: 'T02C0.400', to: 'T02C0.401' },
  { file: 'robot-PTH.drl', from: 'T02\r\nX1.234Y-2.346', to: '' },
  { file: 'robot-NPTH.drl', from: 'X-44.123Y34.568', to: 'X-43.123Y34.568' },
  { file: 'robot-F_Cu.gbr', from: '/DATA_1', to: '/GROUND_1' },
  { file: 'robot-B_Cu.gbr', from: 'Copper,L2,Bot', to: 'Copper,L1,Top' },
  { file: 'robot-Edge_Cuts.gbr', from: 'X50000000', to: 'X49000000' },
])('refuses fabricated output corruption in $file: $from', ({ file, from, to }) => {
  const { files, pcb } = fabrication(rotations[0]);
  const name = `fabrication/${file}`;

  files[name] = files[name].replace(from, to);

  expect(() => inspectFabrication(files, pcb)).toThrow();
});

it.each(['F.Cu', 'B.Cu'])('requires routed tracks on %s even when the Gerber has pads', (layer) => {
  const { files, pcb } = fabrication(rotations[0]);
  const changed = pcb.replace(`(layer "${layer}")`, `(layer "${layer === 'F.Cu' ? 'B.Cu' : 'F.Cu'}")`);

  expect(() => inspectFabrication(files, changed)).toThrow();
});

it('requires a source via even when its absence agrees with the drill file', () => {
  const { files, pcb } = fabrication(rotations[0]);
  const changed = pcb.replace('(via (at 1.2344 2.3456) (drill 0.4001))', '');

  files['fabrication/robot-PTH.drl'] = files['fabrication/robot-PTH.drl'].replace('T02\r\nX1.234Y-2.346', '');

  expect(() => inspectFabrication(files, changed)).toThrow('Fabrication acceptance requires through vias.');
});
