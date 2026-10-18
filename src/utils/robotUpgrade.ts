import type { SavedSceneRecord, ScenePart } from '../types/robotics';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import { ROBOT_PRESETS, needsRobotUpgrade, rawUrl, upgradeRobots, type RobotSourceRef, type RobotUpgrade } from './robotImport';
import { listImportedRobots } from './robotPreview';

/**
 * Brings robots imported at an older data version up to date (robotImport.upgradeRobots), in the
 * scene that's open and in saved scenes. Newer imports record their source on every part; older
 * ones are found by name: a preset, a Parts hand, or a link in Robots → Imported.
 */
export function resolveRobotSource(name: string, robotParts: ScenePart[]): RobotSourceRef | null {
  const preset = ROBOT_PRESETS.find((r) => r.title === name);
  if (preset) return { url: preset.url };
  const hand = robotParts.map((p) => p.componentId && ARTICULATED_PARTS[p.componentId]).find(Boolean);
  if (hand) return { url: hand.url, rotate: hand.rotate };
  const imported = listImportedRobots().find((r) => r.name === name);
  return imported ? { url: rawUrl(imported.url) } : null;
}

/** Applies an upgrade's patches to a list of parts */
export function patchParts(parts: ScenePart[], up: RobotUpgrade): ScenePart[] {
  return parts.map((p) => (up.parts.has(p.id) ? { ...p, ...up.parts.get(p.id) } : p));
}

/** A saved scene with its robots brought up to date, or null when it has none to upgrade */
export async function upgradeSceneRecord(record: SavedSceneRecord): Promise<SavedSceneRecord | null> {
  if (!needsRobotUpgrade(record.parts ?? [])) return null;
  const up = await upgradeRobots(record.parts, record.project?.joints ?? [], resolveRobotSource);
  if (!up || (!up.parts.size && !up.joints.size)) return null;
  return {
    ...record,
    parts: patchParts(record.parts, up),
    project: record.project && {
      ...record.project,
      joints: (record.project.joints ?? []).map((j) => (up.joints.has(j.id) ? { ...j, ...up.joints.get(j.id) } : j)),
    },
  };
}
