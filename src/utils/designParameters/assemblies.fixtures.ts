import { specToPart } from '../../agent/agentScene';
import { DEFAULT_PROJECT } from '../../types/robotics';
import type { SharedScene } from '../sceneFile';
import * as THREE from 'three';

function plateGeometry(width: number, height: number) {
  const shape = new THREE.Shape();

  shape.moveTo(-width / 2, -50);
  shape.lineTo(width / 2, -50);
  shape.lineTo(width / 2, 50);
  shape.lineTo(-width / 2, 50);
  shape.closePath();

  for (const x of [-60, 60]) {
    const hole = new THREE.Path();

    hole.absarc(x, 0, 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
  });
  const positions = Array.from(
    geometry.getAttribute('position').array,
    (value, index) => value - (index % 3 === 2 ? height / 2 : 0),
  );
  const indices = Array.from({ length: positions.length / 3 }, (_, index) => index);

  geometry.dispose();

  return { language: 'openscad' as const, positions, indices };
}

export function parameterRover(): SharedScene {
  const plate = (id: string, name: string, width: number, height: number) =>
    specToPart({
      id,
      name,
      shape: 'cad_part',
      cad: {
        ...plateGeometry(width, height),
        code: `width = ${width};\nspacing = 120;\ndifference(){cube([width,100,${height}],center=true);for(x=[-spacing/2,spacing/2])translate([x,0,0])cylinder(r=2,h=${height + 2},center=true,$fn=24);}`,
      },
      position: [0, 0, id === 'deck' ? 0 : 15],
    });

  return {
    name: 'Shared rover',
    globalGoal: '',
    annotations: [],
    project: { ...DEFAULT_PROJECT },
    parts: [
      plate('deck', 'Rover deck', 160, 6),
      plate('mount', 'Mounting plate', 144, 4),
      specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018', position: [0, 0, -25] }),
      specToPart({ id: 'screw', catalog: 'hardware:socket_head|M3|12', position: [60, 0, 10] }),
    ],
  };
}
