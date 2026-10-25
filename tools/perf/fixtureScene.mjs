import { bounds, cylinder, ellipsoid } from './fixtureMeshes.mjs';

const LINKS = [
  { id: 'pelvis', center: [0, 450, 0], radii: [130, 60, 80] },
  { id: 'torso', center: [0, 620, 0], radii: [150, 110, 90], parent: 'pelvis', joint: [0, 530, 0] },
  { id: 'head', center: [0, 820, 0], radii: [80, 75, 80], parent: 'torso', joint: [0, 740, 0] },
  ...['l', 'r'].flatMap((side) => {
    const x = side === 'l' ? 70 : -70;
    const ax = side === 'l' ? 175 : -175;

    return [
      { id: `${side}-thigh`, center: [x, 330, 0], radii: [45, 110, 50], parent: 'pelvis', joint: [x, 430, 0] },
      { id: `${side}-shin`, center: [x, 140, 0], radii: [40, 100, 45], parent: `${side}-thigh`, joint: [x, 235, 0] },
      { id: `${side}-foot`, center: [x, 25, 25], radii: [45, 25, 80], parent: `${side}-shin`, joint: [x, 45, 0] },
      { id: `${side}-upper-arm`, center: [ax, 600, 0], radii: [35, 90, 38], parent: 'torso', joint: [ax, 680, 0] },
      {
        id: `${side}-forearm`,
        center: [ax, 440, 0],
        radii: [30, 80, 32],
        parent: `${side}-upper-arm`,
        joint: [ax, 515, 0],
      },
      { id: `${side}-hand`, center: [ax, 330, 0], radii: [28, 40, 22], parent: `${side}-forearm`, joint: [ax, 365, 0] },
    ];
  }),
];

const SHELL_DETAIL = 56;
const COVER_DETAIL = 40;
const SCREWS = 8;
const BRACKETS = 4;
const round = (v) => Math.round(v * 1000) / 1000;

function cadPart({ id, name, group, color }, mesh) {
  const { min, max } = bounds(mesh.positions);
  const center = min.map((v, k) => (v + max[k]) / 2);
  const size = max.map((v, k) => round(v - min[k]));
  const positions = mesh.positions.map((v, i) => round(v - center[i % 3]));

  return {
    id,
    name,
    rotation: [0, 0, 0],
    note: '',
    visible: true,
    locked: false,
    group: { id: `perf-${group}`, name: group },
    kind: 'cad_part',
    category: 'custom_models',
    role: 'solid',
    position: center,
    dimensions: { width: Math.max(0.1, size[0]), height: Math.max(0.1, size[1]), depth: Math.max(0.1, size[2]) },
    color,
    mechanicalTag: '3D Printed PLA/PETG',
    printMaterial: 'PLA',
    cad: {
      language: 'openscad',
      code: `// ${name}`,
      positions,
      indices: mesh.indices,
      edges: null,
      originOffset: center,
      baseSize: size,
    },
  };
}

function screwRing(link, count, radius) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const c = [link.center[0] + Math.cos(a) * radius, link.center[1], link.center[2] + Math.sin(a) * radius];

    return { center: c, mesh: cylinder(c, 1.5, 10, 16) };
  });
}

function linkParts(link) {
  const [rx, ry, rz] = link.radii;
  const shell = { id: `${link.id}-shell`, name: `${link.id} shell`, group: link.id, color: '#e4e4e7' };
  const cover = { id: `${link.id}-cover`, name: `${link.id} cover`, group: link.id, color: '#3f3f46' };
  const servo = { id: `${link.id}-servo`, name: `${link.id} servo`, group: link.id, color: '#18181b' };
  const servoCenter = link.joint ?? link.center;
  const parts = [
    cadPart(shell, ellipsoid(link.center, link.radii, SHELL_DETAIL)),
    cadPart(
      cover,
      ellipsoid(
        [link.center[0], link.center[1], link.center[2] + rz * 0.6],
        [rx * 0.7, ry * 0.6, rz * 0.5],
        COVER_DETAIL,
      ),
    ),
    cadPart(servo, cylinder(servoCenter, Math.min(rx, rz) * 0.5, 30, 64)),
  ];

  screwRing(link, SCREWS, Math.min(rx, rz) * 0.6).forEach((s, i) =>
    parts.push(
      cadPart({ id: `${link.id}-screw-${i}`, name: `${link.id} screw ${i}`, group: link.id, color: '#a1a1aa' }, s.mesh),
    ),
  );
  screwRing(link, BRACKETS, Math.min(rx, rz) * 0.9).forEach((s, i) =>
    parts.push(
      cadPart(
        { id: `${link.id}-bracket-${i}`, name: `${link.id} bracket ${i}`, group: link.id, color: '#71717a' },
        cylinder(s.center, 6, ry * 0.8, 24),
      ),
    ),
  );

  return parts;
}

export function fixtureScene() {
  const byLink = new Map(LINKS.map((l) => [l.id, linkParts(l)]));
  const parts = [...byLink.values()].flat();

  return {
    id: 'perf-fixture',
    name: 'Perf fixture',
    globalGoal: '',
    updatedAt: new Date(0).toISOString(),
    parts,
    annotations: [],
    project: { printer: 'bambu-p1s', material: 'PLA', infillPct: 15 },
    joints: fixtureJoints(byLink),
  };
}

const toAgent = ([x, y, z]) => [x, -z, y];

function fixtureJoints(byLink) {
  const ids = (link) => byLink.get(link).map((p) => p.id);

  return LINKS.filter((l) => l.parent).map((l) => {
    const parentLink = LINKS.find((p) => p.id === l.parent);

    return {
      id: `${l.id}-joint`,
      type: 'revolute',
      parent: ids(l.parent),
      child: ids(l.id),
      ...(parentLink.parent ? { parent_joint: `${parentLink.id}-joint` } : {}),
      origin: toAgent(l.joint),
      axis: [1, 0, 0],
      range: [-40, 40],
    };
  });
}

export const cadParts = (scene) =>
  scene.parts.filter((p) => p.id.endsWith('-shell')).sort((a, b) => b.cad.positions.length - a.cad.positions.length);

export function cadSpec(part, id) {
  const positions = [];
  const p = part.cad.positions;

  for (let k = 0; k < p.length; k += 3) positions.push(...toAgent([p[k], p[k + 1], p[k + 2]]));

  return {
    id,
    name: id,
    shape: 'cad_part',
    position: toAgent(part.position).map((v, j) => v + (j === 0 ? 400 : 0)),
    color: part.color,
    cad: { language: part.cad.language, code: part.cad.code, positions, indices: part.cad.indices, edges: null },
  };
}
