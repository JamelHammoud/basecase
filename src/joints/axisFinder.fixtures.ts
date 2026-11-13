import { add3, cross3, dot3, normalize3, scale3, sub3, type Vec3 } from './vec3';

export type Tri = [Vec3, Vec3, Vec3];

export interface Placement {
  axis: Vec3;
  degrees: number;
  offset: Vec3;
}

const TAU = Math.PI * 2;

function facing([a, b, c]: Tri, out: Vec3): Tri {
  return dot3(cross3(sub3(b, a), sub3(c, a)), out) >= 0 ? [a, b, c] : [a, c, b];
}

function quad(corners: [Vec3, Vec3, Vec3, Vec3], out: Vec3): Tri[] {
  const [a, b, c, d] = corners;

  return [facing([a, b, c], out), facing([a, c, d], out)];
}

const around = (radius: number, angle: number, z: number): Vec3 => [
  radius * Math.cos(angle),
  radius * Math.sin(angle),
  z,
];

export function soupOf(tris: Tri[]): Float32Array {
  return new Float32Array(tris.flat(2));
}

export function rotate(v: Vec3, { axis, degrees }: Placement): Vec3 {
  const k = normalize3(axis);
  const angle = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];

  return add3(add3(scale3(v, c), scale3(cross3(k, v), s)), scale3(k, dot3(k, v) * (1 - c)));
}

export const place = (point: Vec3, placement: Placement): Vec3 => add3(rotate(point, placement), placement.offset);

export function placed(tris: Tri[], placement: Placement): Tri[] {
  return tris.map((tri) => tri.map((p) => place(p, placement)) as Tri);
}

export function cylinder(o: { radius: number; length: number; segments: number; rows?: number }): Tri[] {
  const rows = o.rows ?? 1;
  const half = o.length / 2;
  const angleOf = (i: number) => ((i % o.segments) / o.segments) * TAU;
  const ring = (i: number, z: number) => around(o.radius, angleOf(i), z);
  const tris: Tri[] = [];

  for (let i = 0; i < o.segments; i++) {
    const out = around(1, angleOf(i + 0.5), 0);

    for (let r = 0; r < rows; r++) {
      const [z0, z1] = [-half + (o.length * r) / rows, -half + (o.length * (r + 1)) / rows];

      tris.push(...quad([ring(i, z0), ring(i + 1, z0), ring(i + 1, z1), ring(i, z1)], out));
    }

    tris.push(facing([[0, 0, half], ring(i, half), ring(i + 1, half)], [0, 0, 1]));
    tris.push(facing([[0, 0, -half], ring(i, -half), ring(i + 1, -half)], [0, 0, -1]));
  }

  return tris;
}

export function holedSolid(o: { inner: number; outer: (angle: number) => number; length: number; segments: number }) {
  const half = o.length / 2;
  const angleOf = (i: number) => ((i % o.segments) / o.segments) * TAU;
  const hole = (i: number, z: number) => around(o.inner, angleOf(i), z);
  const rim = (i: number, z: number) => around(o.outer(angleOf(i)), angleOf(i), z);
  const tris: Tri[] = [];

  for (let i = 0; i < o.segments; i++) {
    const radial = around(1, angleOf(i + 0.5), 0);

    tris.push(...quad([hole(i, -half), hole(i + 1, -half), hole(i + 1, half), hole(i, half)], scale3(radial, -1)));
    tris.push(...quad([rim(i, -half), rim(i + 1, -half), rim(i + 1, half), rim(i, half)], radial));
    tris.push(...quad([hole(i, half), hole(i + 1, half), rim(i + 1, half), rim(i, half)], [0, 0, 1]));
    tris.push(...quad([hole(i, -half), hole(i + 1, -half), rim(i + 1, -half), rim(i, -half)], [0, 0, -1]));
  }

  return tris;
}

export const squareOutline = (half: number) => (angle: number) =>
  half / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));

export function box(min: Vec3, max: Vec3): Tri[] {
  const corner = (x: number, y: number, z: number): Vec3 => [
    x ? max[0] : min[0],
    y ? max[1] : min[1],
    z ? max[2] : min[2],
  ];

  return [
    ...quad([corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)], [-1, 0, 0]),
    ...quad([corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)], [1, 0, 0]),
    ...quad([corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)], [0, -1, 0]),
    ...quad([corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)], [0, 1, 0]),
    ...quad([corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)], [0, 0, -1]),
    ...quad([corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)], [0, 0, 1]),
  ];
}

export function sphere(radius: number, rings: number, segments: number): Tri[] {
  const point = (ring: number, i: number): Vec3 => {
    const polar = (ring / rings) * Math.PI;
    const azimuth = ((i % segments) / segments) * TAU;

    return [
      radius * Math.sin(polar) * Math.cos(azimuth),
      radius * Math.sin(polar) * Math.sin(azimuth),
      radius * Math.cos(polar),
    ];
  };
  const tris: Tri[] = [];

  for (let ring = 0; ring < rings; ring++) {
    for (let i = 0; i < segments; i++) {
      const corners: [Vec3, Vec3, Vec3, Vec3] = [
        point(ring, i),
        point(ring, i + 1),
        point(ring + 1, i + 1),
        point(ring + 1, i),
      ];
      const out = normalize3(add3(corners[0], corners[2]));

      tris.push(
        ...quad(corners, out).filter(([a, b, c]) => cross3(sub3(b, a), sub3(c, a)).some((v) => Math.abs(v) > 1e-9)),
      );
    }
  }

  return tris;
}

export function extruded(profile: [number, number][], length: number): Tri[] {
  const half = length / 2;
  const centre = profile.reduce(([sx, sy], [x, y]) => [sx + x / profile.length, sy + y / profile.length], [0, 0]);
  const at = (i: number, z: number): Vec3 => [profile[i % profile.length][0], profile[i % profile.length][1], z];
  const tris: Tri[] = [];

  for (let i = 0; i < profile.length; i++) {
    const [a, b] = [at(i, 0), at(i + 1, 0)];
    const out: Vec3 = [b[1] - a[1], a[0] - b[0], 0];

    tris.push(...quad([at(i, -half), at(i + 1, -half), at(i + 1, half), at(i, half)], out));
    tris.push(facing([[centre[0], centre[1], half], at(i, half), at(i + 1, half)], [0, 0, 1]));
    tris.push(facing([[centre[0], centre[1], -half], at(i, -half), at(i + 1, -half)], [0, 0, -1]));
  }

  return tris;
}

export function filletedProfile(o: {
  width: number;
  height: number;
  radius: number;
  steps: number;
}): [number, number][] {
  const [cx, cy] = [o.width - o.radius, o.height - o.radius];
  const arc = Array.from({ length: o.steps + 1 }, (_, k): [number, number] => {
    const angle = (k / o.steps) * (Math.PI / 2);

    return [cx + o.radius * Math.cos(angle), cy + o.radius * Math.sin(angle)];
  });

  return [[0, 0], [o.width, 0], ...arc, [0, o.height]];
}
