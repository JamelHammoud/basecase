import { specToPart, type AgentOp } from '../src/agent/agentScene';
import { booleanPart } from '../src/booleans/parts';
import { DEFAULT_PROJECT, type SavedSceneRecord, type ScenePart, type ProjectSettings } from '../src/types/robotics';
import { generatedCad, supportDesign } from '../src/utils/sketch/fixtures/supportDesigns';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { buildRig } from '../src/utils/kinematics';
import { supportFingerprint } from '../src/utils/sketch/support';
import { createHash } from 'node:crypto';
import { finishAppearance } from '../src/appearance/model';

interface Request {
  kind: string;
  payload: Record<string, unknown>;
}

export interface AgentWorkload {
  name: string;
  scene: SavedSceneRecord;
  requests: Request[];
  checkpoint?: boolean;
}

const grid = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    specToPart({
      id: `grid-${i}`,
      name: `Plate ${i}`,
      shape: 'box',
      position: [(i % 15) * 30, Math.floor(i / 15) * 30, 0],
      size: [20, 20, 10],
    }),
  );
const apply = (ops: AgentOp[]): Request => ({ kind: 'apply', payload: { ops } });
const control = () => specToPart({ id: 'control', name: 'Control plate', shape: 'box', position: [-100, 0, 0] });
const settings = { ...DEFAULT_PROJECT };

function workload(
  name: string,
  parts: ScenePart[],
  requests: Request[],
  project: ProjectSettings = settings,
): AgentWorkload {
  const robot = fixtureRobots().find((entry) => entry.id === 'arm-6dof')!;
  const combined = new Map([control(), ...robot.parts, ...parts].map((part) => [part.id, part]));

  return {
    name,
    scene: {
      id: `workflow-${name}`,
      name,
      globalGoal: '',
      updatedAt: '2026-01-01T00:00:00.000Z',
      parts: [...combined.values()],
      partCount: combined.size,
      annotations: [],
      project: { ...project, joints: project.joints ?? robot.joints },
    },
    requests,
  };
}

function texturedParts(texture: string) {
  const bytes = texture.slice(texture.indexOf(',') + 1);
  const hash = createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('hex');
  const appearance = { ...finishAppearance('paint', '#a4a4a4'), textures: { baseColor: hash } };
  const image: ScenePart = {
    ...control(),
    id: 'texture',
    name: 'Textured plate',
    appearance,
  };

  return { appearance, image, assets: { [hash]: { texture: { bytes, mimeType: 'image/png' } } } };
}

const sketchRegenerations = (id: string) =>
  Array.from({ length: 8 }, (_, index) =>
    apply([{ op: 'update', part: { id, cad: generatedCad([166 + index * 6, 6, 120], 16) } }]),
  );

export function agentWorkloads(texture: string): AgentWorkload[] {
  const base = grid(225);
  const cad = generatedCad([40, 20, 30], 20);
  const imported = specToPart({ id: 'imported', shape: 'cad_part', cad });
  const mesh: ScenePart = {
    ...imported,
    kind: 'mesh',
    cad: undefined,
    mesh: { positions: imported.cad!.positions, indices: imported.cad!.indices, baseSize: imported.cad!.baseSize },
  };
  const cut = booleanPart({
    id: 'cut',
    base: specToPart({ id: 'plate', size: [100, 80, 10] }),
    tools: [specToPart({ id: 'bore', shape: 'cylinder', size: [20, 20, 30] })],
    op: 'subtract',
  });
  const sketch = supportDesign(0);
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const built = buildCase({ goal: 'drawer', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!built.ok) throw new Error(built.problem);

  built.kase.id = 'workflow-drawer';

  const assemblies = Array.from({ length: 36 }, (_, i): AgentOp => ({
    op: 'add',
    part: {
      id: `servo-${i}`,
      catalog: 'component:feetech-sts3215|c018',
      position: [(i % 6) * 70, Math.floor(i / 6) * 70, 40],
    },
  }));
  const transactions = Array.from({ length: 12 }, (_, batch) =>
    apply(
      Array.from({ length: 24 }, (_, i): AgentOp => ({
        op: 'add',
        part: { id: `transaction-${batch}-${i}`, shape: 'box', position: [i * 25, batch * 25, 80] },
      })),
    ),
  );
  const dense = Array.from({ length: 12 }, (_, i) =>
    specToPart({ id: `shell-${i}`, shape: 'cad_part', cad, position: [i * 50, 0, 80] }),
  );
  const { appearance, image, assets } = texturedParts(texture);
  const rows = [
    workload('primitive-insertion', base, [
      apply(
        Array.from({ length: 120 }, (_, i) => ({
          op: 'add',
          part: { id: `primitive-${i}`, shape: 'box', position: [i * 20, 0, 60] },
        })),
      ),
    ]),
    workload(
      'imported-mesh-replacement',
      [...base, mesh],
      [apply([{ op: 'add', part: { id: 'imported', shape: 'cad_part', cad: generatedCad([50, 20, 35], 24) } }])],
    ),
    workload(
      'boolean-editing',
      [...base, cut],
      [apply([{ op: 'update', part: { id: 'bore', position: [12, 0, 0] } }])],
    ),
    workload('sketch-regeneration', [...base, ...sketch.parts], sketchRegenerations(sketch.source.id)),
    workload('catalog-assemblies', base, [apply(assemblies)]),
    workload(
      'joint-authoring',
      [...base, ...arm.parts],
      [
        {
          kind: 'define_joints',
          payload: {
            replace: true,
            joints: arm.joints.map((joint) => ({
              id: joint.id,
              type: joint.type,
              parent: joint.parent,
              child: joint.child,
              parent_joint: joint.parentJoint,
              origin: [joint.origin[0], -joint.origin[2], joint.origin[1]],
              axis: [joint.axis[0], -joint.axis[2], joint.axis[1]],
              range: [-30, 30],
              actuation: joint.actuation,
            })),
          },
        },
      ],
    ),
    workload(
      'articulated-case-edits',
      [...base, ...arm.parts],
      [{ kind: 'create_case', payload: { name: 'Cabinet lid', goal: 'lid', world: 'floor' } }],
      { ...settings, joints: arm.joints, cases: [built.kase] },
    ),
    workload('multi-part-transactions', base, transactions),
    {
      ...workload(
        'history-checkpoints',
        [...base, ...dense],
        [apply([{ op: 'update', part: { id: 'grid-0', name: 'Checkpoint plate' } }])],
      ),
      checkpoint: true,
    },
    workload(
      'textured-scene-save',
      [...grid(1000).map((part) => ({ ...part, appearance })), ...dense, image],
      [apply([{ op: 'update', part: { id: 'grid-0', name: 'Saved plate' } }])],
    ),
  ];
  const textured = rows.find((row) => row.name === 'textured-scene-save')!;

  textured.scene.worldAssets = assets;

  return rows;
}

export function verifyAgentWorkload(workload: AgentWorkload, saved: SavedSceneRecord & { history?: string }) {
  const byId = new Map(saved.parts.map((part) => [part.id, part]));
  const added = workload.requests.flatMap((request) =>
    request.kind === 'apply'
      ? (request.payload.ops as AgentOp[]).flatMap((op) => (op.op === 'add' ? [op.part.id] : []))
      : [],
  );
  const checks: Record<string, () => boolean> = {
    'primitive-insertion': () => byId.has('primitive-119'),
    'imported-mesh-replacement': () =>
      byId.get('imported')?.kind === 'cad_part' && byId.get('imported')!.cad!.indices.length > 20000,
    'boolean-editing': () => byId.get('cut')?.boolean?.operands.find((part) => part.id === 'bore')?.position[0] === 12,
    'sketch-regeneration': () =>
      byId.get('source')?.dimensions.width === 208 &&
      byId.get('feature')?.sketch?.support?.fingerprint === supportFingerprint(byId.get('source')!),
    'catalog-assemblies': () => byId.get('servo-35')?.componentId === 'feetech-sts3215',
    'joint-authoring': () =>
      saved.project?.joints?.length === (workload.requests[0].payload.joints as Array<{ id: string }>).length &&
      saved.project.joints.every((joint) => joint.range?.[0] === -30 && joint.range[1] === 30),
    'articulated-case-edits': () =>
      !!saved.project?.cases?.find((kase) => kase.name === 'Cabinet lid')?.world.objects.some((object) => object.joint),
    'multi-part-transactions': () =>
      byId.has('transaction-11-23') && saved.parts.length === workload.scene.parts.length + 288,
    'history-checkpoints': () =>
      byId.get('grid-0')?.name === 'Checkpoint plate' &&
      !!saved.history &&
      Object.values(JSON.parse(saved.history).versions as Record<string, { label: string }>).some(
        (version) => version.label === 'During agent edits',
      ),
    'textured-scene-save': () =>
      byId.get('grid-0')?.name === 'Saved plate' &&
      workload.scene.parts.every(
        (part) => !part.appearance || JSON.stringify(byId.get(part.id)?.appearance) === JSON.stringify(part.appearance),
      ) &&
      JSON.stringify(saved.worldAssets) === JSON.stringify(workload.scene.worldAssets),
  };

  return byId.get('control')?.position[0] === 37 && added.every((id) => byId.has(id)) && checks[workload.name]();
}
