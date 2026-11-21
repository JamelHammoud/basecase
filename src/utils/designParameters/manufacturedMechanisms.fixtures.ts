import { TOLERANCE_MECHANISMS } from './tolerances.fixtures';

const SEAT = 'difference(){cylinder(d=feature+8,h=8,$fn=32);translate([0,0,-1])cylinder(d=feature,h=10,$fn=32);}';
const PIN = 'cylinder(d=feature,h=8,$fn=32);';
const POCKET = 'difference(){cube([feature+8,24,12],center=true);translate([0,0,3])cube([feature,16,12],center=true);}';
const SLIDE = 'difference(){cube([feature+8,30,8],center=true);translate([0,0,3])cube([feature,32,8],center=true);}';
const KEYED =
  'difference(){cylinder(d=20,h=8,$fn=32);translate([0,0,-1])union(){cylinder(d=10,h=10,$fn=32);translate([-feature/2,0,0])cube([feature,9,10]);}}';
const HOLES =
  'difference(){cube([feature+12,20,4],center=true);for(x=[-feature/2,feature/2])translate([x,0,0])cylinder(d=3,h=8,center=true,$fn=24);}';

const SOURCES = [
  [SEAT, PIN],
  [SEAT, PIN],
  ['difference(){cube([16,16,4],center=true);cylinder(d=feature,h=8,center=true,$fn=24);}', PIN],
  [
    'union(){cube([feature+8,12,4],center=true);for(x=[-feature/2-2,feature/2+2])translate([x,0,4])cube([4,12,12],center=true);}',
    'cube([feature,8,4],center=true);',
  ],
  [POCKET, 'cube([feature,16,12],center=true);'],
  [POCKET, 'difference(){cube([feature,16,4],center=true);cube([feature-4,12,8],center=true);}'],
  [SLIDE, 'cube([feature,30,4],center=true);'],
  [KEYED, 'union(){cylinder(d=10,h=8,$fn=32);translate([-feature/2,0,0])cube([feature,9,8]);}'],
  [HOLES, HOLES],
  [
    'union(){cube([feature+16,8,4],center=true);for(x=[-feature/2-4,feature/2+4])translate([x,0,6])cube([8,8,12],center=true);}',
    'cube([feature,6,6],center=true);',
  ],
];

export function manufacturedSource(index: number, companion: boolean) {
  const mechanism = TOLERANCE_MECHANISMS[index];

  return `feature = ${mechanism[companion ? 2 : 1]};\n${SOURCES[index][companion ? 1 : 0]}`;
}
