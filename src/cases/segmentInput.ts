import type { SegmentBase, SegmentInput, SegmentJaw } from '../datasets/segments';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotMorphology } from '../sim/morphology';
import type { Recording } from '../sim/recorder';
import type { Trace } from '../skills/contract';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { caseStages } from './caseStages';
import type { Gripper } from './gripper';
import { boundEffector, robotFacts } from './robotFit';
import type { Case } from './schema';

export interface SegmentSource {
  recording: Recording;
  model: SimModel | null;
  rig: Rig;
  parts: ScenePart[];
  kase: Case | null;
  kind: 'sim' | 'real';
  joints?: string[];
  trace?: Trace | null;
}

const BASES: Record<RobotMorphology, SegmentBase> = {
  fixed: 'fixed',
  legged: 'legs',
  wheeled: 'wheels',
  'wheel-legged': 'wheels',
};

const DEG = Math.PI / 180;
const MM = 0.001;

function jawsOf(source: SegmentSource, gripper: Gripper | null): SegmentJaw[] {
  const { model, recording, rig } = source;
  const order = model ? model.joints.map((j) => j.id) : (source.joints ?? []);

  return (gripper?.jaws ?? []).flatMap((jaw) => {
    const i = order.indexOf(jaw.joint);
    const qpos = i < 0 ? undefined : recording.jointQpos?.[i];
    const actuator = source.kind === 'sim' ? (model?.joints[i]?.actuator ?? -1) : -1;

    if (qpos === undefined) return [];

    const scale = rig.byId.get(jaw.joint)?.type === 'prismatic' ? MM : DEG;

    return [{ qpos, open: jaw.open * scale, closed: jaw.closed * scale, ...(actuator >= 0 ? { ctrl: actuator } : {}) }];
  });
}

const objectsOf = ({ kase, kind, model }: SegmentSource) =>
  kase && kind === 'sim' && model
    ? kase.world.objects
        .filter((o) => o.behavior === 'dynamic')
        .map(({ id, name, position, size }) => ({ id, name, position, size }))
    : [];

export function segmentInputOf(source: SegmentSource): SegmentInput {
  const { recording, model, rig, parts, kase, kind, trace } = source;
  const facts = robotFacts(rig, parts);
  const mobile = !!recording.root && recording.root[0] >= 0;

  return {
    recording,
    model,
    kind,
    jaws: jawsOf(source, facts.gripper),
    hand: kase?.slot ? boundEffector(kase.slot.binding, facts, rig) : facts.endEffector,
    objects: objectsOf(source),
    stages: kase && trace ? caseStages(kase.task.contract, trace) : [],
    base: mobile ? BASES[facts.morphology] : 'fixed',
  };
}
