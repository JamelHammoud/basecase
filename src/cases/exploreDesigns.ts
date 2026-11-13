import { actuatorOf, COMPONENT_BY_ID, type ActuatorSpec } from '../data/components';
import { servoLayout } from '../robot/sceneRobot';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { suitsVolts } from '../utils/actuatorRules';
import { servoParts, servoSupplyVolts } from '../utils/engineeringPower';
import { prettyJointName } from '../utils/kinematics';
import { findPowerSources, sceneTether, suggestedTether } from '../utils/powerSources';

export const MAX_DESIGNS = 64;

const MAX_TRIED = 4096;

export interface ServoGroup {
  joint: string;
  name: string;
  parts: string[];
  componentId: string;
  current: string;
  options: string[];
}

export interface Design {
  variants: string[];
  volts: number;
}

export interface ExploreSpace {
  groups: ServoGroup[];
  volts: number[];
  current: Design;
  fixedVolts: boolean;
  others: ActuatorSpec[];
}

export interface DesignScene {
  parts: ScenePart[];
  project: ProjectSettings;
}

const variantsOf = (componentId: string) =>
  (COMPONENT_BY_ID[componentId]?.variants ?? []).filter((v) => v.actuator).map((v) => v.id);

const specOf = (g: Pick<ServoGroup, 'componentId'>, variant: string) => actuatorOf(g.componentId, variant)!;

function groupOf(j: RobotJoint, byId: Map<string, ScenePart>, taken: Set<string>): ServoGroup | null {
  const servos = (j.actuators ?? []).flatMap((id) => byId.get(id) ?? []);
  const first = servos[0];
  const componentId = first?.componentId;

  if (!componentId || servos.some((p) => p.componentId !== componentId || taken.has(p.id))) return null;

  const options = variantsOf(componentId);
  const current = first.componentVariant;

  if (options.length < 2 || !current || !options.includes(current)) return null;

  return { joint: j.id, name: prettyJointName(j.name), parts: servos.map((p) => p.id), componentId, current, options };
}

function servoGroups(parts: ScenePart[], joints: RobotJoint[]): ServoGroup[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const taken = new Set<string>();
  const groups: ServoGroup[] = [];

  for (const j of servoLayout(joints).movable) {
    const group = groupOf(j, byId, taken);

    if (!group) continue;

    group.parts.forEach((id) => taken.add(id));
    groups.push(group);
  }

  return groups;
}

export const supplyVolts = (parts: ScenePart[], project: ProjectSettings) =>
  servoSupplyVolts({ parts, project, servos: servoParts(parts) });

function voltOptions(groups: ServoGroup[], current: number, others: ActuatorSpec[]): number[] {
  const rated = groups.flatMap((g) => g.options.map((v) => specOf(g, v).atVolts)).sort((a, b) => a - b);
  const usable = rated.filter((v) => others.every((a) => suitsVolts(a, v)));

  return [...new Set([current, ...usable])];
}

export function exploreSpace(parts: ScenePart[], project: ProjectSettings): ExploreSpace | null {
  const groups = servoGroups(parts, project.joints ?? []);
  const volts = supplyVolts(parts, project);

  if (!groups.length || volts === undefined) return null;

  const grouped = new Set(groups.flatMap((g) => g.parts));
  const others = servoParts(parts)
    .filter((p) => !grouped.has(p.id))
    .flatMap((p) => actuatorOf(p.componentId!, p.componentVariant) ?? []);
  const fixedVolts = findPowerSources({ parts, project }).length > 0;

  return {
    groups,
    others,
    fixedVolts,
    current: { variants: groups.map((g) => g.current), volts },
    volts: fixedVolts ? [volts] : voltOptions(groups, volts, others),
  };
}

export const designKey = (d: Design) => `${d.volts}|${d.variants.join(',')}`;

export const sameDesign = (a: Design, b: Design) => designKey(a) === designKey(b);

const suits = (space: ExploreSpace, d: Design) =>
  d.variants.every((v, i) => suitsVolts(specOf(space.groups[i], v), d.volts)) &&
  space.others.every((a) => suitsVolts(a, d.volts));

function* subsets(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) {
    yield [];

    return;
  }

  for (let i = from; i <= n - k; i++) for (const rest of subsets(n, k - 1, i + 1)) yield [i, ...rest];
}

function* swaps(space: ExploreSpace, picked: number[], at = 0): Generator<string[]> {
  if (at === picked.length) {
    yield [...space.current.variants];

    return;
  }

  const i = picked[at];
  const group = space.groups[i];

  for (const variant of group.options.filter((v) => v !== group.current)) {
    for (const rest of swaps(space, picked, at + 1)) {
      rest[i] = variant;
      yield rest;
    }
  }
}

function* uniform(space: ExploreSpace): Generator<string[]> {
  const { groups, current } = space;
  const variants = [...new Set(groups.flatMap((g) => g.options))];

  for (const variant of variants)
    yield groups.map((g, i) => (g.options.includes(variant) ? variant : current.variants[i]));
}

function* allVariants(space: ExploreSpace): Generator<string[]> {
  yield space.current.variants;
  yield* uniform(space);

  for (let k = 1; k <= space.groups.length; k++)
    for (const picked of subsets(space.groups.length, k)) yield* swaps(space, picked);
}

function* candidates(space: ExploreSpace): Generator<Design> {
  for (const variants of allVariants(space)) for (const volts of space.volts) yield { variants, volts };
}

export function exploreDesigns(space: ExploreSpace, limit = MAX_DESIGNS): Design[] {
  const designs = [space.current];
  const seen = new Set([designKey(space.current)]);
  let tried = 0;

  for (const design of candidates(space)) {
    if (designs.length >= limit || ++tried > MAX_TRIED) break;

    const key = designKey(design);

    if (seen.has(key) || !suits(space, design)) continue;

    seen.add(key);
    designs.push(design);
  }

  return designs;
}

function suppliedAt(parts: ScenePart[], project: ProjectSettings, volts: number): ProjectSettings {
  if (supplyVolts(parts, project) === volts) return project;

  const amps = sceneTether({ parts, project })?.amps ?? suggestedTether(parts).amps;

  return { ...project, tether: { volts, amps } };
}

export function designScene(scene: DesignScene, space: ExploreSpace, design: Design): DesignScene {
  const swapped = new Map(space.groups.flatMap((g, i) => g.parts.map((id) => [id, design.variants[i]] as const)));
  const parts = scene.parts.map((p) => {
    const variant = swapped.get(p.id);

    return variant && variant !== p.componentVariant ? { ...p, componentVariant: variant } : p;
  });

  return { parts, project: space.fixedVolts ? scene.project : suppliedAt(parts, scene.project, design.volts) };
}

export function sceneDesign(space: ExploreSpace, scene: DesignScene): Design {
  const byId = new Map(scene.parts.map((p) => [p.id, p]));

  return {
    variants: space.groups.map((g) => byId.get(g.parts[0])?.componentVariant ?? g.current),
    volts: supplyVolts(scene.parts, scene.project) ?? space.current.volts,
  };
}
