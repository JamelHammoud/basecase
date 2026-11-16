import { wiringNetlist } from '../wiring/netlist';
import { componentSize } from '../data/components';
import { makeSpec } from '../data/hardware';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { guideFingerprint } from '../guide/guideFingerprint';
import { resolvePrinter } from '../data/printers';
import { jobSpec } from '../print/job';
import { weld, writeThreeMf } from '../print/threeMf';
import { fixtureMeasures, fixtureTriangles, box } from '../sim/fixtures/parts';
import { fixtureRobots, withoutGripper } from '../sim/fixtures/robots';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { isPrinted } from '../utils/bom';
import { reportFromShapes } from '../utils/printReport';
import { checkPrintability } from '../three/printability';
import type { ScenePart } from '../types/robotics';
import type { KitJob } from './types';

const CASES = [
  ['differential rover', 'rover-diff'],
  ['SO-101-style arm', 'arm-6dof'],
  ['hexapod', 'hexapod'],
  ['quadruped', 'quad-servo'],
  ['pan-tilt camera', 'arm-3dof'],
  ['gripper', 'arm-6dof'],
  ['mixed-servo arm', 'arm-6dof'],
  ['multi-material chassis', 'rover-diff'],
  ['repeated limb modules', 'hexapod'],
  ['mixed sheet-and-printed', 'arm-3dof'],
] as const;

export const kitFixtureNames = CASES.map(([name]) => name);

function servo(id: string, mixed: boolean, variant = 'c001'): ScenePart {
  const componentId = mixed ? 'dynamixel-xl330-m288' : 'feetech-sts3215';

  return {
    ...box(id, [0, 400, 0], [20, 40, 20], 50),
    kind: 'component',
    componentId,
    componentVariant: mixed ? undefined : variant,
    dimensions: componentSize(componentId),
  };
}

function sourceOf(name: string) {
  const robot = fixtureRobots().find((r) => r.id === CASES.find(([n]) => n === name)?.[1])!;

  if (name === 'SO-101-style arm') return withoutGripper(robot);

  if (name === 'pan-tilt camera') {
    const camera: ScenePart = {
      ...box('camera', [0, 210, 0], [25, 24, 9], 4),
      kind: 'component',
      componentId: 'raspberry-pi-camera-3',
      dimensions: componentSize('raspberry-pi-camera-3'),
    };

    return {
      ...robot,
      parts: [...robot.parts.slice(0, 3), camera],
      joints: robot.joints.slice(0, 2).map((j, i) => (i === 1 ? { ...j, child: [...j.child, camera.id] } : j)),
    };
  }

  if (name === 'gripper')
    return {
      ...robot,
      parts: robot.parts.filter((p) => p.id === 'palm' || p.id.startsWith('finger_')),
      joints: robot.joints
        .filter((j) => j.id.startsWith('finger_'))
        .map((j) => ({ ...j, parent: ['palm'], parentJoint: undefined })),
    };

  return robot;
}

export function kitFixture(name = 'SO-101-style arm'): KitJob {
  const source = sourceOf(name);
  const moving = source.joints.filter((j) => j.type !== 'fixed');
  const actuators = moving.map((j, i) =>
    servo(
      `servo-${j.id}`,
      name === 'mixed-servo arm' && i % 2 === 0,
      name === 'mixed-servo arm' && i % 4 === 3 ? 'c018' : 'c001',
    ),
  );
  const parts: ScenePart[] = [
    ...source.parts.map((p, i) => ({
      ...p,
      ...(name === 'mixed sheet-and-printed' && i === 0
        ? {
            sheet: { material: 'aluminum-6061' as const, thicknessMm: 3.18 },
            dimensions: { width: 60, height: 3.18, depth: 40 },
          }
        : {}),
      ...(name === 'repeated limb modules' ? { print: { copies: 2 } } : {}),
      printMaterial: name === 'multi-material chassis' && i % 2 ? ('PETG' as const) : ('PLA' as const),
    })),
    ...actuators,
    {
      ...box('screw', [0, 400, 0], [3, 8, 3], 1),
      kind: 'hardware',
      hardware: makeSpec('socket_head', { size: 'M3', length: 8 }),
    },
  ];

  parts.push({ ...parts.at(-1)!, id: 'screw-2' });

  const joints = source.joints.map((j) => ({ ...j, actuators: moving.includes(j) ? [`servo-${j.id}`] : undefined }));
  const { job } = fixturePackageJob({ id: name, parts, joints });
  const scene = approximateScene(name, parts, joints);
  const plan = buildGuidePlan(scene, job.project.material);
  const triangles = fixtureTriangles(parts);
  const measures = fixtureMeasures(parts);

  for (const part of parts.filter((part) => part.sheet)) {
    measures[part.id].sheet = {
      thicknessMm: 3.18,
      normal: [0, 1, 0],
      outline: [
        [0, 0],
        [60, 0],
        [60, 40],
        [0, 40],
      ],
      holes: [],
    };
  }

  const printer = resolvePrinter(undefined, []);
  const report = reportFromShapes(
    parts
      .filter(isPrinted)
      .map((part) => ({ part, shape: { measure: measures[part.id], check: checkPrintability(triangles(part.id)!)! } })),
    { project: job.project, printer },
  );
  const spec = jobSpec(report.plan, printer, job.project);
  const files = Object.fromEntries(
    spec.files.map((file) => [
      file.key,
      writeThreeMf({
        objects: file.items.map((item, i) => ({ id: i + 1, name: item.name, mesh: weld(triangles(item.id)!) })),
        items: file.items.map((item, i) => ({ objectId: i + 1, matrix: item.matrix, plate: item.plate })),
        plates: file.plates,
        plateSize: spec.plateSize,
        layout: 'grid',
      }),
    ]),
  );

  return {
    name,
    parts,
    project: job.project,
    measures,
    purchases: {},
    wiring: wiringNetlist({ parts, project: job.project }),
    mapInput: { name, parts, project: job.project, model: job.model },
    guide: {
      plan,
      html: '<!doctype html><title>Build guide</title>',
      fingerprint: guideFingerprint(name, parts, job.project),
    },
    spec,
    files,
    print: report,
    checks: null,
    checksFingerprint: '',
  };
}
