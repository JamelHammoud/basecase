import { armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import type { SizedArm } from '../utils/armSizing';
import type { AgentCadPayload } from '../agent/cadMesh';
import { specToPart } from '../agent/agentScene';
import { buildSkeleton } from '../agent/skeleton';

export interface ArmBuildOptions {
  links: boolean;
  taken: ReadonlySet<string>;
  previous?: RobotSkeleton;
}

export interface ArmBuild {
  parts: ScenePart[];
  skeleton: RobotSkeleton;
}

type Box = [[number, number, number], [number, number, number]];

const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];

function placeholder(code: string, [min, max]: Box): AgentCadPayload {
  const positions = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => [
    k & 1 ? max[0] : min[0],
    k & 2 ? max[1] : min[1],
    k & 4 ? max[2] : min[2],
  ]);

  return { language: 'openscad', code, positions, indices: BOX_TRIANGLES };
}

const LINK_MATCH = /servo_link\((\d+(?:\.\d+)?)/;
const RISER_MATCH = /printed_block\(\[120, 90, (\d+(?:\.\d+)?)\]/;

function roughBox(code: string): Box {
  const link = LINK_MATCH.exec(code);

  if (link)
    return [
      [-16, -16, -40],
      [Number(link[1]) + 16, 16, 6],
    ];

  const riser = RISER_MATCH.exec(code);

  if (riser)
    return [
      [-10, -45, -47.4 - Number(riser[1])],
      [110, 45, -47.4],
    ];

  return [
    [-16, -45, -47.4],
    [110, 45, 6],
  ];
}

function uniqueIds(ids: string[], taken: ReadonlySet<string>): Map<string, string> {
  const used = new Set(taken);

  return new Map(
    ids.map((id) => {
      let n = 1;
      let next = id;

      while (used.has(next)) next = `${id}-${++n}`;

      used.add(next);

      return [id, next];
    }),
  );
}

export function armBuild(arm: SizedArm, { links, taken, previous }: ArmBuildOptions): ArmBuild {
  const template = armTemplate({ ...arm.shape, servos: arm.servos.keys });
  const frameOf = new Map(template.joints.flatMap((j) => [...j.child, ...j.actuators].map((id) => [id, j.id])));
  const printed = links ? template.parts : [];
  const rename = uniqueIds([...printed.map((p) => p.id), ...template.servos.map((s) => s.id)], taken);
  const group = { id: `group-${rename.get(template.servos[0].id)!}`, name: 'Arm' };
  const placed = (id: string) => ({ id: rename.get(id)!, frame: frameOf.get(id) });
  const servos = template.servos.map((s) => ({
    ...specToPart({
      catalog: s.catalog,
      position: s.position,
      rotation: s.rotation,
      ...placed(s.id),
    }),
    group,
  }));
  const parts = printed.map((p) => {
    const part = specToPart({
      ...placed(p.id),
      name: p.name,
      shape: 'cad_part',
      material: 'printed',
      cad: placeholder(p.code, roughBox(p.code)),
      position: p.position,
      rotation: p.rotation,
    });

    return { ...part, group, cad: { ...part.cad!, pending: true } };
  });

  return {
    parts: [...parts, ...servos],
    skeleton: buildSkeleton({ ...arm.skeleton, replace: true }, previous).skeleton,
  };
}

export interface ArmScene {
  parts: () => ScenePart[];
  skeleton: () => RobotSkeleton | undefined;
  place: (parts: ScenePart[], skeleton: RobotSkeleton) => void;
  links: boolean;
}

export function placeArm(arm: SizedArm, scene: ArmScene): void {
  const now = scene.parts();
  const built = armBuild(arm, { links: scene.links, taken: new Set(now.map((p) => p.id)), previous: scene.skeleton() });

  scene.place([...now, ...built.parts], built.skeleton);
}
