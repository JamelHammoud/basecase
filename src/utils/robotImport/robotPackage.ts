import type { CalibrationHistory } from '../../reality/history';
import type { ServoCalibration, ServoFamily } from '../../reality/types';
import type { RobotJoint, ScenePart } from '../../types/robotics';

export const JOINT_MAP_FILE = 'joint_map.json';
export const PACKAGE_FORMAT = 'basecase-robot-package';

export interface JointMapServo {
  componentId: string;
  variant?: string;
  family?: ServoFamily;
  id?: number;
  link?: string;
}

export interface JointMapJoint {
  id: string;
  name: string;
  mjcf?: string;
  type: 'revolute' | 'prismatic';
  limits?: [number, number];
  servo: JointMapServo | null;
  zeroOffset: number;
  direction: 1 | -1;
  calibration: ServoCalibration | null;
}

export interface JointMap {
  format: typeof PACKAGE_FORMAT;
  version: number;
  robot: string;
  urdf?: string;
  mjcf?: string;
  joints: JointMapJoint[];
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' && v.length < 256 ? v : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const allFinite = (o: unknown, optional: string[] = []) =>
  isObject(o) && Object.entries(o).every(([k, v]) => finite(v) || (optional.includes(k) && v === undefined));
const FAMILIES: ServoFamily[] = ['sts3215', 'xl330'];
const FIT_NUMBERS = ['volts', 'kt', 'resistance', 'armature', 'firmwareKp', 'errorGain', 'errorGainRatio', 'maxDuty'];

function calibration(v: unknown): ServoCalibration | null {
  if (!isObject(v) || !isObject(v.fit) || !FAMILIES.includes(v.family as ServoFamily)) return null;

  const { fit } = v;
  const fitOk =
    fit.model === 'bam-m6' &&
    FIT_NUMBERS.every((k) => finite(fit[k])) &&
    finite(fit.delayS) &&
    allFinite(fit.friction) &&
    (fit.maxVelocity === undefined || finite(fit.maxVelocity));

  if (!fitOk || !finite(v.version) || !finite(v.volts) || !text(v.verdict)) return null;

  return v as unknown as ServoCalibration;
}

function servo(v: unknown): JointMapServo | null {
  if (!isObject(v) || !text(v.componentId)) return null;

  return {
    componentId: text(v.componentId)!,
    variant: text(v.variant),
    family: FAMILIES.find((f) => f === v.family),
    id: finite(v.id) ? v.id : undefined,
    link: text(v.link),
  };
}

function joint(v: unknown): JointMapJoint | null {
  if (!isObject(v) || !text(v.name)) return null;

  const limits = Array.isArray(v.limits) && v.limits.length === 2 && v.limits.every(finite) ? v.limits : undefined;

  return {
    id: text(v.id) ?? text(v.name)!,
    name: text(v.name)!,
    mjcf: text(v.mjcf),
    type: v.type === 'prismatic' ? 'prismatic' : 'revolute',
    limits: limits as [number, number] | undefined,
    servo: servo(v.servo),
    zeroOffset: finite(v.zeroOffset) ? v.zeroOffset : 0,
    direction: v.direction === -1 ? -1 : 1,
    calibration: calibration(v.calibration),
  };
}

export function parseJointMap(raw: string): JointMap | null {
  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObject(data) || data.format !== PACKAGE_FORMAT || !Array.isArray(data.joints)) return null;

  return {
    format: PACKAGE_FORMAT,
    version: finite(data.version) ? data.version : 1,
    robot: text(data.robot) ?? 'Robot',
    urdf: text(data.urdf),
    mjcf: text(data.mjcf),
    joints: data.joints.map(joint).filter((j): j is JointMapJoint => !!j),
  };
}

export function packageEntries(map: JointMap, mapPath: string): string[] {
  const dir = mapPath.split('/').slice(0, -1).join('/');
  const at = (name: string) => (dir ? `${dir}/${name}` : name);

  return [map.urdf, 'robot.urdf', map.mjcf, 'robot.xml'].filter((n): n is string => !!n).map(at);
}

export interface MappedRobot {
  parts: ScenePart[];
  joints: RobotJoint[];
  servoCalibrations: Record<string, CalibrationHistory>;
}

const SAFE_ID = /^[\w-]{1,128}$/;

function renamedIds(joints: RobotJoint[], byName: Map<string, JointMapJoint>): Map<string, string> {
  const rename = new Map<string, string>();
  const taken = new Set(joints.map((j) => j.id));

  for (const j of joints) {
    const wanted = byName.get(j.name)?.id;

    if (!wanted || wanted === j.id || !SAFE_ID.test(wanted) || taken.has(wanted)) continue;

    taken.delete(j.id);
    taken.add(wanted);
    rename.set(j.id, wanted);
  }

  return rename;
}

function history(c: ServoCalibration): CalibrationHistory {
  return { versions: [c], active: c.verdict === 'measured' ? c.version : null };
}

export function applyJointMap(
  robot: { parts: ScenePart[]; joints: RobotJoint[] },
  map: JointMap,
  partOfLink: Map<string, string>,
): MappedRobot {
  const byName = new Map(map.joints.map((j) => [j.name, j]));
  const rename = renamedIds(robot.joints, byName);
  const idOf = (id: string) => rename.get(id) ?? id;
  const servoParts = new Map<string, JointMapServo>();
  const servoCalibrations: Record<string, CalibrationHistory> = {};

  const joints = robot.joints.map((j) => {
    const entry = byName.get(j.name);
    const servoPart = entry?.servo?.link ? partOfLink.get(entry.servo.link) : undefined;
    const id = idOf(j.id);

    if (servoPart) servoParts.set(servoPart, entry!.servo!);

    if (entry?.calibration) servoCalibrations[id] = history(entry.calibration);

    return {
      ...j,
      id,
      parentJoint: j.parentJoint && idOf(j.parentJoint),
      ...(servoPart ? { actuators: [servoPart] } : {}),
    };
  });

  const parts = robot.parts.map((p) => {
    const s = servoParts.get(p.id);

    return s ? { ...p, componentId: s.componentId, ...(s.variant ? { componentVariant: s.variant } : {}) } : p;
  });

  return { parts, joints, servoCalibrations };
}
