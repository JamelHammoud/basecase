import type { RobotJoint, ScenePart } from '../types/robotics';
import type { OnshapeSource } from '../types/robotLink';
import type { ImportedRobot } from '../utils/robotImport';
import type { ConvertedModel } from '../utils/robotImport/simready';

const OCCURRENCE = /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64}){0,8}$/;
const MATE = /^[A-Za-z0-9_-]{1,64}$/;

export const isOccurrence = (value: unknown) => typeof value === 'string' && OCCURRENCE.test(value);

export const isMateId = (value: unknown) => typeof value === 'string' && MATE.test(value);

function partWithIds(p: ScenePart, occurrences: Map<string, string[]>, source: OnshapeSource): ScenePart {
  const ids = p.robotLink ? (occurrences.get(p.robotLink.link) ?? []).filter(isOccurrence) : [];
  const group = p.group ? { ...p.group, onshape: source } : p.group;

  if (!p.robotLink || !ids.length) return { ...p, group };

  return { ...p, group, robotLink: { ...p.robotLink, onshape: ids } };
}

function jointWithMate(j: RobotJoint, mate: string | undefined): RobotJoint {
  return isMateId(mate) ? { ...j, onshape: { mate: mate! } } : j;
}

export function withOnshapeIds(robot: ImportedRobot, model: ConvertedModel, source: OnshapeSource): ImportedRobot {
  const occurrences = new Map(model.links.map((l) => [l.name, l.occurrences ?? []]));
  const moving = model.joints.filter((j) => j.type !== 'fixed');

  return {
    ...robot,
    parts: robot.parts.map((p) => partWithIds(p, occurrences, source)),
    joints: robot.joints.map((j, i) => jointWithMate(j, moving[i]?.mate)),
  };
}
