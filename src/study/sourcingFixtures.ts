import { box, fixtureMeasures, fixtureTriangles, joint } from '../sim/fixtures/parts';
import { panTilt } from '../cameras/operator/fixtures/panTilt';
import { withServos } from '../sim/fixtures/servoLegs';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT, type ProjectSettings, type Purchases, type ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { confirmOffer } from '../utils/supplierOffers';
import { studyScene } from './scene';
import type { StudyKnob, StudyScene } from './types';

export const SOURCING_REQUIREMENTS = { destination: 'US-CA', requiredBy: '2026-12-01', quantity: 1 };
export const SOURCING_TIME = '2026-11-20T12:00:00.000Z';
export const SOURCING_CHOICES = ['component:feetech-sts3215|c001', 'component:feetech-sts3215|c018'];

export function sourcingScene(parts: ScenePart[], project: ProjectSettings): StudyScene {
  const triangles = fixtureTriangles(parts);

  return {
    parts,
    project,
    measures: fixtureMeasures(parts),
    triangles: Object.fromEntries(parts.map((part) => [part.id, triangles(part.id)!])),
  };
}

function motorized(parts: ScenePart[], project: ProjectSettings): StudyScene {
  const motors = (project.joints ?? []).map((item) => ({
    ...box(`${item.id}-servo`, item.origin, [24, 24, 24], 55),
    kind: 'component' as const,
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
  }));
  const joints = (project.joints ?? []).map((item, index) => ({
    ...item,
    parent: [...item.parent, motors[index].id],
    actuators: [motors[index].id],
  }));

  return sourcingScene([...parts, ...motors], { ...project, joints });
}

function conveyor(): StudyScene {
  const parts = [box('frame', [0, 20, 0], [240, 20, 80], 500), box('roller', [90, 45, 0], [25, 25, 80], 100)];
  const roller = joint({
    id: 'roller-drive',
    link: ['frame', 'roller'],
    origin: [90, 45, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range: null,
  });

  return motorized(parts, { ...DEFAULT_PROJECT, joints: [roller] });
}

function mixedBus(): StudyScene {
  const robot = servoArm();
  const parts = robot.parts.map((part) =>
    part.id === robot.joints[1].actuators?.[0]
      ? { ...part, componentId: 'towerpro-mg996r', componentVariant: undefined }
      : part,
  );

  return sourcingScene(parts, { ...DEFAULT_PROJECT, joints: robot.joints });
}

function repeatedModules(): StudyScene {
  const scene = conveyor();
  const parts = [0, 1, 2].flatMap((index) =>
    scene.parts.map((part) => ({
      ...part,
      id: `${part.id}-${index}`,
      position: [part.position[0], part.position[1], part.position[2] + index * 120] as [number, number, number],
    })),
  );
  const joints = [0, 1, 2].flatMap((index) =>
    (scene.project.joints ?? []).map((item) => ({
      ...item,
      id: `${item.id}-${index}`,
      parent: item.parent.map((id) => `${id}-${index}`),
      child: item.child.map((id) => `${id}-${index}`),
      actuators: item.actuators?.map((id) => `${id}-${index}`),
      origin: [item.origin[0], item.origin[1], item.origin[2] + index * 120] as [number, number, number],
    })),
  );

  return sourcingScene(parts, { ...scene.project, joints });
}

export function sourcingMorphologies(): Array<{ name: string; scene: StudyScene }> {
  const robots = [
    ['rover', 'rover-diff'],
    ['quadruped', 'quad-servo'],
    ['hexapod', 'hexapod'],
    ['biped', 'biped-servo'],
    ['gripper', 'arm-6dof'],
  ].map(([name, id]) => {
    const robot = withServos(id, { componentId: 'feetech-sts3215', variant: 'c001' });

    return { name, scene: sourcingScene(robot.parts, { ...DEFAULT_PROJECT, joints: robot.joints }) };
  });
  const arm = servoArm();
  const camera = panTilt();

  return [
    ...robots,
    { name: 'fixed arm', scene: sourcingScene(arm.parts, { ...DEFAULT_PROJECT, joints: arm.joints }) },
    { name: 'pan-tilt camera', scene: motorized(camera.parts, camera.project) },
    { name: 'conveyor mechanism', scene: conveyor() },
    { name: 'mixed-bus robot', scene: mixedBus() },
    { name: 'repeated-module robot', scene: repeatedModules() },
  ];
}

export function sourcingKnob(scene: StudyScene): Extract<StudyKnob, { kind: 'servo' }> {
  return { id: 'actuators', kind: 'servo', joints: [scene.project.joints![0].id], values: SOURCING_CHOICES };
}

export async function sourcingEvidence(scene: StudyScene, now = SOURCING_TIME): Promise<Purchases> {
  const knob = sourcingKnob(scene);
  const scenes = [scene, await studyScene(scene, [knob], [1])];
  const lines = scenes.flatMap((candidate) => buildBom({ ...candidate, purchases: {} }).lines);
  const purchases: Purchases = {};

  for (const line of lines) {
    const identity = {
      ...line.identity,
      manufacturer: line.identity?.manufacturer ?? 'Fixture materials',
      mpn: line.identity?.mpn ?? line.key,
      supplier: 'Fixture supplier',
      supplierPartNumber: line.key,
      orderingUnit: 'pack',
      unitsPerOrder: 4,
    };
    const exactLine = { ...line, identity };
    const offer = {
      id: line.key,
      identity,
      breaks: [
        { minOrders: 1, price: 12 },
        { minOrders: 5, price: 10 },
      ],
      availableOrders: 100000,
      currency: 'USD',
      destination: 'US-CA',
      observedAt: now,
      arrivalEarliest: '2026-11-23',
      arrivalLatest: '2026-11-25',
      source: `https://example.com/offers/${encodeURIComponent(line.key)}`,
      evidence: 'entered' as const,
    };

    purchases[line.key] = {
      priceUsd: 12,
      packQty: 4,
      checkedAt: now.slice(0, 10),
      identity,
      supplierOffers: { selectedId: offer.id, offers: [confirmOffer(offer, exactLine, 4)] },
    };
  }

  return purchases;
}
