import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_CASE } from './caseCodeChecks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function appImport(file) {
  if (process.env.VITEST) return import(path.join(root, file));

  const { appModule } = await import('./scenes.mjs');

  return appModule(file);
}

const FIXTURES = {
  hexapod: 'hexapod',
  rover: 'rover-diff',
  quadruped: 'quad-servo',
  biped: 'biped-servo',
  arm: 'arm-6dof',
  smallArm: 'arm-3dof',
  wristCameraArm: 'arm-6dof',
};

const ARMS = new Set(['arm', 'smallArm', 'wristCameraArm']);

const WRIST_CAMERA = {
  id: 'wrist-camera',
  name: 'Wrist Camera',
  kind: 'component',
  category: 'perception',
  role: 'solid',
  componentId: 'raspberry-pi-camera-3',
  position: [0, 440, 20],
  rotation: [0, 0, 0],
  dimensions: { width: 25, height: 12, depth: 24 },
  color: '#333333',
  note: '',
  visible: true,
  locked: false,
};

function withWristCamera({ parts, joints }) {
  const last = joints.findLast((j) => j.id.startsWith('arm'));

  return {
    parts: [...parts, WRIST_CAMERA],
    joints: joints.map((j) => (j === last ? { ...j, child: [...j.child, WRIST_CAMERA.id] } : j)),
  };
}

async function robotOf(kind) {
  if (kind === 'g1') {
    const { g1Humanoid } = await appImport('/e2e/g1Fixture.ts');
    const g1 = g1Humanoid();

    return { parts: g1.parts, joints: g1.project.joints };
  }

  const { fixtureRobots } = await appImport('/src/sim/fixtures/robots.ts');
  const robot = fixtureRobots().find((r) => r.id === FIXTURES[kind]);

  return kind === 'wristCameraArm' ? withWristCamera(robot) : robot;
}

export const startConsole = (extra = {}) => ({
  input: extra.input ?? ['keys'],
  panels: [...(extra.panels ?? []), { id: 'tries', kind: 'list', of: 'tries' }],
  layout: {
    areas: [
      ...(extra.left ? [{ size: 320, panels: extra.left }] : []),
      { canvas: true },
      { size: 300, panels: ['tries'] },
    ],
  },
});

const codeSpec = ({ id, title, source, height }) => ({
  id,
  kind: 'code',
  ...(title ? { title } : {}),
  source,
  ...(height ? { height } : {}),
});

export function withCode(start, panels) {
  const overlays = panels.filter((p) => p.overlay);
  const columns = panels.filter((p) => !p.overlay);
  const areas = start.layout.areas.map((a) =>
    'canvas' in a
      ? {
          canvas: true,
          ...(overlays.length ? { overlays: overlays.map((p) => ({ panel: p.id, pointer: true, ...p.overlay })) } : {}),
        }
      : a,
  );
  const at = areas.findIndex((a) => 'canvas' in a);

  return {
    ...start,
    input: start.input.includes('code') ? start.input : [...start.input, 'code'],
    panels: [...start.panels, ...panels.map(codeSpec)],
    layout: {
      areas: columns.length ? areas.toSpliced(at, 0, { size: 360, panels: columns.map((p) => p.id) }) : areas,
    },
  };
}

export async function codeScene({ robot, name, console }) {
  const [{ presetCase }, { buildRig }, { DEFAULT_PROJECT }, { joints, parts }] = await Promise.all([
    appImport('/src/cases/caseBuilder.ts'),
    appImport('/src/utils/kinematics.ts'),
    appImport('/src/types/robotics.ts'),
    robotOf(robot),
  ]);
  const preset = presetCase(ARMS.has(robot) ? 'touch-the-dots' : 'reach-the-flag', buildRig(joints, parts), parts);
  const kase = { ...preset, id: START_CASE, name, task: { ...preset.task, seconds: 120 }, console };

  return { name, parts, project: { ...DEFAULT_PROJECT, joints, cases: [kase] }, annotations: [] };
}
