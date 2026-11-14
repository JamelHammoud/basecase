import { armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import type { SizedArm } from '../utils/armSizing';
import { boxPlaceholder, type CadBox } from '../agent/cadPlaceholder';
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

const LINK_MATCH = /servo_link\((\d+(?:\.\d+)?)/;
const RISER_MATCH = /printed_block\(\[120, 90, (\d+(?:\.\d+)?)\]/;

function roughBox(code: string): CadBox {
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
      cad: boxPlaceholder(p.code, roughBox(p.code)),
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
