import { joinAnd } from '../assembly/reportText';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';

const MEASURING = new Set([
  'interference',
  'assembly',
  'verify',
  'sweep_design',
  'define_joints',
  'find_joint_axes',
  'simulate',
  'set_world',
  'start_drive',
  'operate',
  'craft',
  'visible_share',
  'pose',
  'animate',
  'check_interfaces',
  'fasten_plan',
]);

export async function awaitPartModels(kind: string, viewport: Viewport3DHandle | null): Promise<void> {
  const failed = (await viewport?.meshesReady()) ?? [];

  if (!failed.length || !MEASURING.has(kind)) return;

  const names = failed.map((id) => COMPONENT_BY_ID[id]?.name ?? id);

  throw new Error(
    `Couldn't load the 3D model of ${joinAnd(names)}, so this check would measure a box in its place. Restart Basecase, then run it again.`,
  );
}
