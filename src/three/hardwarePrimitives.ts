import * as THREE from 'three';

export function thread(d: number, pitch: number, length: number, y0: number): THREE.BufferGeometry {
  const rc = d / 2;
  const rr = Math.max(0.2, rc - 0.54 * pitch);
  const p = Math.max(pitch, length / 120);
  const chamfer = Math.min(p * 0.8, length * 0.2);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(rr, 0), new THREE.Vector2(rc, chamfer)];

  for (let y = chamfer + p / 2; y < length - p / 2; y += p) {
    pts.push(new THREE.Vector2(rr, y));
    pts.push(new THREE.Vector2(rc, Math.min(length, y + p / 2)));
  }

  pts.push(new THREE.Vector2(rc, length), new THREE.Vector2(0, length));

  const g = new THREE.LatheGeometry(pts, 28);

  g.translate(0, y0, 0);

  return g;
}

export function lathe(profile: Array<[number, number]>, segments = 40): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    segments,
  );
}

export function polygonShape(radius: number, sides: number, angle0 = 0): THREE.Shape {
  const shape = new THREE.Shape();

  for (let i = 0; i <= sides; i++) {
    const a = angle0 + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;

    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  return shape;
}

export function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape();

  s.absarc(0, 0, r, 0, Math.PI * 2, false);

  return s;
}

export function holePath(r: number, sides = 32, angle0 = 0): THREE.Path {
  const p = new THREE.Path();

  for (let i = 0; i <= sides; i++) {
    const a = angle0 - (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }

  return p;
}

export function prism(shape: THREE.Shape, height: number, y0: number, bevel = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 32,
  });

  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);

  return g;
}

export const hexRadius = (s: number) => s / Math.sqrt(3);
