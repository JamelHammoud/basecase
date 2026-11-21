import { specToPart } from '../../agent/agentScene';
import { generatedCad, mountingFeature } from '../sketch/fixtures/supportDesigns';
import type { DesignParameter } from './types';

export const PARAMETER_MECHANISMS = [
  {
    name: 'Rover chassis and deck holes',
    width: 160,
    after: 180,
    depth: 100,
    height: 12,
    offset: 40,
    centers: [
      [-70, 0],
      [70, 0],
    ],
    mount: 164,
    servos: 2,
    screws: 4,
  },
  {
    name: 'Arm pedestal and mounting plate',
    width: 70,
    after: 90,
    depth: 90,
    height: 24,
    offset: 40,
    centers: [
      [-25, 0],
      [25, 0],
    ],
    mount: 74,
    servos: 1,
    screws: 4,
  },
  {
    name: 'Quadruped paired hip brackets',
    width: 60,
    after: 80,
    depth: 44,
    height: 24,
    offset: 40,
    centers: [
      [-20, 0],
      [20, 0],
    ],
    mount: 64,
    servos: 4,
    screws: 4,
  },
  {
    name: 'Hexapod radial mounts',
    width: 180,
    after: 200,
    depth: 200,
    height: 8,
    offset: 40,
    centers: [
      [80, 0],
      [40, 69.2820323],
      [-40, 69.2820323],
      [-80, 0],
      [-40, -69.2820323],
      [40, -69.2820323],
    ],
    mount: 184,
    servos: 6,
    screws: 6,
  },
  {
    name: 'Pan tilt camera bracket',
    width: 56,
    after: 76,
    depth: 40,
    height: 30,
    offset: 40,
    centers: [
      [-18, 0],
      [18, 0],
    ],
    mount: 60,
    servos: 2,
    screws: 2,
  },
  {
    name: 'Gripper jaw spacing',
    width: 64,
    after: 84,
    depth: 28,
    height: 16,
    offset: 8,
    centers: [
      [-38, 0],
      [38, 0],
    ],
    mount: 92,
    servos: 1,
    screws: 2,
  },
  {
    name: 'Enclosure lid and body',
    width: 100,
    after: 120,
    depth: 64,
    height: 24,
    offset: 8,
    centers: [
      [-56, 0],
      [56, 0],
    ],
    mount: 124,
    servos: 0,
    screws: 4,
  },
  {
    name: 'Wheel hub and flange',
    width: 50,
    after: 70,
    depth: 70,
    height: 18,
    offset: 40,
    centers: [
      [-15, 0],
      [15, 0],
    ],
    mount: 54,
    servos: 0,
    screws: 4,
  },
  {
    name: 'Four bar ground mounting plate',
    width: 120,
    after: 140,
    depth: 60,
    height: 18,
    offset: 40,
    centers: [
      [-50, 0],
      [50, 0],
    ],
    mount: 124,
    servos: 0,
    screws: 4,
  },
  {
    name: 'Appliance service opening and cover',
    width: 140,
    after: 160,
    depth: 100,
    height: 8,
    offset: 12,
    centers: [
      [-74, 0],
      [74, 0],
    ],
    mount: 164,
    servos: 0,
    screws: 4,
  },
];

const BODY = [
  'union(){translate([0,0,h/2-1])cube([width,d,2],center=true);for(y=[-d/2+4,d/2-4])translate([0,y,0])cube([width,8,h],center=true);for(x=[-width/2+4,width/2-4])translate([x,0,0])cube([8,d,h],center=true);}',
  'union(){translate([0,0,-h/2+2])cylinder(d=width,h=4,center=true,$fn=48);cylinder(d=width/2,h=h,center=true,$fn=48);}',
  'union(){translate([0,0,-h/2+2])cube([width,d,4],center=true);for(x=[-width/2+4,width/2-4])translate([x,0,0])cube([8,d,h],center=true);}',
  'cylinder(d=width,h=h,center=true,$fn=48);',
  'union(){translate([0,0,-h/2+2])cube([width,d,4],center=true);for(x=[-width/2+4,width/2-4])translate([x,0,0])cube([8,d,h],center=true);}',
  'for(x=[-width/2+4,width/2-4])translate([x,0,0])cube([8,d,h],center=true);',
  'difference(){cube([width,d,h],center=true);translate([0,0,4])cube([width-16,d-16,h],center=true);}',
  'union(){cylinder(d=width,h=4,center=true,$fn=48);cylinder(d=24,h=h,center=true,$fn=32);}',
  'union(){cube([width,d,6],center=true);for(x=[-spacing/2,spacing/2])translate([x,0,0])cylinder(r=5,h=h,center=true,$fn=32);}',
  'difference(){cube([width,d,h],center=true);cube([width-24,d-24,h+2],center=true);}',
];

export function mechanismCode(index: number, companion = false) {
  const design = PARAMETER_MECHANISMS[index];
  const initial = companion ? design.width + design.mount - design.after : design.width;
  const body = companion ? 'cube([width,d,4],center=true);' : BODY[index];
  const portZ = companion ? '-2' : ['h/2', '-h/2+4', 'h/2', 'h/2', 'h/2', 'h/2', 'h/2', '2', '3', 'h/2'][index];
  const portX = companion ? '0' : 'width/2-4';
  const portY = !companion && index === 5 ? 'd/2-4' : '0';
  const port = companion ? 'bottom' : 'mount';
  const axis = companion ? '-1' : '1';
  const holes =
    index === 3
      ? 'for(a=[0:60:300])translate([spacing/2*cos(a),spacing/2*sin(a),0])cylinder(r=2,h=h+4,center=true,$fn=24);'
      : 'for(x=[-spacing/2,spacing/2])translate([x,0,0])cylinder(r=2,h=h+4,center=true,$fn=24);';

  return `width = ${initial};\nspacing = ${design.width - design.offset};\nd = ${design.depth};\nh = ${design.height};\ndifference(){${body}${holes}}\necho("PORT","${port}",[${portX},${portY},${portZ}],[0,0,${axis}],"face");`;
}

export function mechanismFixture(index: number) {
  const design = PARAMETER_MECHANISMS[index];
  const cadPart = (id: string, companion: boolean) =>
    specToPart({
      id,
      name: companion ? 'Mounting plate' : design.name,
      shape: 'cad_part',
      cad: { ...generatedCad([design.width, design.height, design.depth]), code: mechanismCode(index, companion) },
    });
  const source = {
    ...cadPart('source', false),
    dimensionBindings: [
      { kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'span' },
      { kind: 'cad' as const, target: 'spacing', unit: 'mm' as const, expression: `span - ${design.offset} mm` },
    ],
  };
  const companion = {
    ...cadPart('mount', true),
    dimensionBindings: [
      {
        kind: 'cad' as const,
        target: 'width',
        unit: 'mm' as const,
        expression: `span ${design.mount > design.after ? '+' : '-'} ${Math.abs(design.mount - design.after)} mm`,
      },
      { kind: 'cad' as const, target: 'spacing', unit: 'mm' as const, expression: `span - ${design.offset} mm` },
    ],
  };
  const rail = {
    ...specToPart({
      id: 'rail',
      name: 'Support rail',
      shape: 'box',
      size: [design.width, 20, 6],
      position: [0, design.depth + 30, 0],
    }),
    dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'span' }],
  };
  const feature = mountingFeature(rail, { name: 'Sensor mount', feature: [20, 10, 3], holes: 1, offset: true });
  const radius = feature.sketch!.sketch.constraints.find((constraint) => constraint.kind === 'radius')!;
  const boundFeature = {
    ...feature,
    dimensionBindings: [{ kind: 'sketch' as const, target: radius.id, unit: 'mm' as const, expression: 'clearance' }],
  };
  const servos = Array.from({ length: design.servos }, (_, id) =>
    specToPart({ id: `servo-${id}`, catalog: 'component:feetech-sts3215|c018', position: [id * 48, -100, 0] }),
  );
  const screws = Array.from({ length: design.screws }, (_, id) =>
    specToPart({ id: `screw-${id}`, catalog: 'hardware:socket_head|M3|12', position: [id * 12, -150, 0] }),
  );
  const parameters: DesignParameter[] = [
    { name: 'span', unit: 'mm', value: design.width },
    { name: 'clearance', unit: 'mm', value: 2 },
  ];

  return { design, parameters, parts: [source, companion, rail, boundFeature, ...servos, ...screws] };
}
