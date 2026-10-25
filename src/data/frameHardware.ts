import type { HardwareSpec } from './hardware';
import { MotionHardware, boreFacts, box, holeRow } from './hardwareKit';
import {
  CLAMP_COLLARS,
  Collar,
  DIN471_RINGS,
  DIN472_RINGS,
  EXTRUSIONS,
  GT2_IDLERS,
  GT2_PULLEYS,
  Gt2Pulley,
  MISUMI_CORNER_BRACKETS,
  MISUMI_GPA_GT2060_WIDTH,
  SET_COLLARS,
  T_NUTS,
} from './motionTables';

const threadOf = (spec: HardwareSpec) => Number(spec.size.slice(1));

const extrusion: MotionHardware = {
  name: (spec) => `${spec.size} × ${spec.length} Extrusion`,
  dimensions: (spec) => {
    const e = EXTRUSIONS[spec.size];

    return box(e.size[0], spec.length ?? 0, e.size[1]);
  },
  facts: (spec) => {
    const e = EXTRUSIONS[spec.size];

    return [
      { label: 'Slot', value: `${e.slotOpening} mm, series ${e.series}` },
      { label: 'Center bore', value: `Ø${e.bores[0].diameter}, ${e.bores[0].endTap.thread} end tap` },
      { label: 'Weight', value: `${e.massKgPerM}`, unit: 'kg/m' },
      { label: 'Standard', value: `Misumi ${e.partNumber}` },
    ];
  },
  holes: (spec) => {
    const e = EXTRUSIONS[spec.size];
    const tap = e.bores[0].endTap;

    return [
      holeRow('End tap', `${tap.thread} × ${tap.depth}`),
      holeRow('Slot nuts', `M3–M${e.series === 5 ? 5 : 6}, slot ${e.slotOpening}`, ''),
    ];
  },
  note: (spec) => {
    const e = EXTRUSIONS[spec.size];

    return `Misumi ${e.partNumber}: ${e.size.join(' × ')} mm, ${e.slotOpening} mm slots (series ${e.series}), ${e.massKgPerM} kg/m. Cut to length; ends tap ${e.bores[0].endTap.thread}. Bolt on with slot ${e.slotOpening} T-nuts.`;
  },
  shop: (spec) => `${spec.size} aluminum extrusion t-slot ${spec.length}mm`,
  sizeColumns: 3,
  massG: (spec) => EXTRUSIONS[spec.size].massKgPerM * (spec.length ?? 0),
  cutToLength: true,
};

function tNut(slot: keyof typeof T_NUTS): MotionHardware {
  const n = T_NUTS[slot];
  const width = slot === 'slot6' ? 6 : 8;

  return {
    name: (spec) => `${spec.size} T-Nut, Slot ${width}`,
    dimensions: () => box(n.width, n.height, n.length),
    facts: () => [
      { label: 'Fits', value: `${width} mm slot, series ${n.series}` },
      { label: 'Standard', value: `Misumi ${n.partNumber}` },
    ],
    holes: (spec) => [holeRow('Screw', `${spec.size}, into the nut`, '')],
    note: (spec) =>
      `Misumi ${n.partNumber} (${spec.size}): slides in from the end of a series ${n.series} extrusion, tongue up into the ${width} mm slot. ${n.width} × ${n.length} × ${n.height} mm.`,
    shop: (spec) => `${spec.size} t-nut ${width}mm slot ${n.series === 5 ? '2020' : '3030'} extrusion`,
    massG: (spec) => (n.width * n.length * n.bodyHeight - Math.PI * (threadOf(spec) / 2) ** 2 * n.bodyHeight) * 0.00785,
  };
}

const BRACKET_LABEL: Record<string, string> = { HBLFSN5: '30 × 30', HBLFSNF5: '20 × 30' };

const cornerBracket: MotionHardware = {
  name: (spec) => `${BRACKET_LABEL[spec.size]} Corner Bracket`,
  dimensions: (spec) => {
    const b = MISUMI_CORNER_BRACKETS[spec.size];

    return box(b.legBase, b.legUpright, b.width);
  },
  facts: (spec) => {
    const b = MISUMI_CORNER_BRACKETS[spec.size];

    return [
      { label: 'Holes', value: `Ø${b.holeDiameter} for M5` },
      { label: 'Allowable load', value: `${b.allowableLoadN}`, unit: 'N' },
      { label: 'Standard', value: `Misumi ${b.partNumber}` },
    ];
  },
  holes: (spec) => {
    const b = MISUMI_CORNER_BRACKETS[spec.size];

    return [
      holeRow('Base holes', b.baseHoles.join(', '), 'mm from the corner'),
      holeRow('Upright hole', `${b.uprightHoles[0]}`, 'mm from the corner'),
    ];
  },
  note: (spec) => {
    const b = MISUMI_CORNER_BRACKETS[spec.size];

    return `Misumi ${b.partNumber} for 2020 (series 5): Ø${b.holeDiameter} holes for ${b.screw.replace('CBM5-', 'M5 × ')} screws into slot 6 T-nuts. Allowable load ${b.allowableLoadN} N.`;
  },
  shop: () => '2020 aluminum extrusion inside corner bracket',
  sizeLabel: (s) => BRACKET_LABEL[s] ?? s,
  sizeColumns: 2,
  massG: (spec) => MISUMI_CORNER_BRACKETS[spec.size].massG,
};

function collar(table: Record<string, Collar>, kind: 'Set Screw' | 'Clamp'): MotionHardware {
  return {
    name: (spec) => `Ø${spec.size} ${kind} Collar`,
    dimensions: (spec) => box(table[spec.size].od, table[spec.size].width),
    facts: (spec) => {
      const c = table[spec.size];

      return [
        ...boreFacts(c.bore, c.od, c.width),
        { label: 'Screw', value: c.screw.replace('x', ' × ') },
        { label: 'Standard', value: c.part },
      ];
    },
    holes: (spec) => [holeRow('Shaft', `Ø${spec.size}`)],
    note: (spec) => {
      const c = table[spec.size];

      return `${c.part}: Ø${c.bore} bore, Ø${c.od} × ${c.width} mm, ${c.screw.replace('x', ' × ')} ${kind === 'Clamp' ? 'clamp screw (no shaft marring)' : 'set screw'}.`;
    },
    shop: (spec) => `${spec.size}mm shaft collar ${kind === 'Clamp' ? 'one piece clamp' : 'set screw'}`,
    sizeLabel: (s) => `Ø${s}`,
    sizeColumns: 4,
  };
}

const ringSize = (spec: HardwareSpec, shaft: boolean) => {
  const r = shaft ? DIN471_RINGS[spec.size] : DIN472_RINGS[spec.size];
  const od = shaft ? r.d3 + 2 * r.aMax : r.d3;

  return { ...r, od };
};

function retainingRing(shaft: boolean): MotionHardware {
  const std = shaft ? 'DIN 471' : 'DIN 472';
  const fits = shaft ? 'shaft' : 'bore';

  return {
    name: (spec) => `Ø${spec.size} ${shaft ? 'Shaft' : 'Bore'} Retaining Ring`,
    dimensions: (spec) => {
      const r = ringSize(spec, shaft);

      return box(r.od, r.s);
    },
    facts: (spec) => {
      const r = ringSize(spec, shaft);

      return [
        { label: 'Groove', value: `Ø${r.d2} × ${r.m}`, unit: 'mm' },
        { label: 'Thickness', value: `${r.s}`, unit: 'mm' },
        { label: 'Standard', value: std },
      ];
    },
    holes: (spec) => {
      const r = ringSize(spec, shaft);

      return [holeRow('Groove', `Ø${r.d2} × ${r.m} wide`), holeRow('Edge clearance', `${r.nMin}`, 'mm min')];
    },
    note: (spec) => {
      const r = ringSize(spec, shaft);

      return `${std} ring for a Ø${spec.size} ${fits}: cut a groove Ø${r.d2} × ${r.m} mm at least ${r.nMin} mm from the ${fits} end. Needs ${shaft ? 'external' : 'internal'} circlip pliers.`;
    },
    shop: (spec) => `${std} ${spec.size}mm ${shaft ? 'external' : 'internal'} retaining ring circlip`,
    sizeLabel: (s) => `Ø${s}`,
    sizeColumns: 5,
  };
}

const W = MISUMI_GPA_GT2060_WIDTH;

export const pulleyLength = (p: Gt2Pulley) => (p.hubD ? W.overallLengthL : W.widthOverFlangesW);

function pulleyMount(p: Gt2Pulley, idler: boolean): string {
  if (idler) return 'Spins on its own bearings';

  return p.setScrews ? `${p.setScrews} set screws` : 'Plain bore, no set screws';
}

function pulley(table: Record<string, Gt2Pulley>, idler: boolean): MotionHardware {
  return {
    name: (spec) => `GT2 ${table[spec.size].teeth}T ${idler ? 'Idler' : 'Pulley'}, Ø${table[spec.size].bore} Bore`,
    dimensions: (spec) => {
      const p = table[spec.size];

      return box(p.flange, pulleyLength(p));
    },
    facts: (spec) => {
      const p = table[spec.size];

      return [
        { label: 'Pitch diameter', value: `${p.pd}`, unit: 'mm' },
        { label: 'Belt', value: 'GT2, 2 mm pitch, 6 mm wide' },
        ...(p.setScrews ? [{ label: 'Set screws', value: p.setScrews }] : []),
        { label: 'Standard', value: p.part },
      ];
    },
    holes: (spec) => [holeRow(idler ? 'Shaft' : 'Motor shaft', `Ø${table[spec.size].bore}`)],
    note: (spec) => {
      const p = table[spec.size];

      return `${p.part}: ${p.teeth} teeth, pitch Ø${p.pd} mm, Ø${p.bore} bore. ${pulleyMount(p, idler)}. Belt travels ${(Math.PI * p.pd).toFixed(1)} mm per turn.`;
    },
    shop: (spec) =>
      `GT2 ${table[spec.size].teeth} teeth ${idler ? 'idler' : 'timing pulley'} ${table[spec.size].bore}mm bore 6mm belt`,
    sizeLabel: (s) => s.replace('-', ' Ø'),
    sizeColumns: 2,
  };
}

export const FRAME_HARDWARE = {
  extrusion,
  t_nut: tNut('slot6'),
  t_nut_8: tNut('slot8'),
  corner_bracket: cornerBracket,
  set_collar: collar(SET_COLLARS, 'Set Screw'),
  clamp_collar: collar(CLAMP_COLLARS, 'Clamp'),
  shaft_ring: retainingRing(true),
  bore_ring: retainingRing(false),
  gt2_pulley: pulley(GT2_PULLEYS, false),
  gt2_idler: pulley(GT2_IDLERS, true),
} satisfies Record<string, MotionHardware>;
