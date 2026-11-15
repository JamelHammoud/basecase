import { exploreSpace, supplyVolts } from '../cases/exploreDesigns';
import { actuatorOf, COMPONENT_BY_ID } from '../data/components';
import { servoLayout } from '../robot/sceneRobot';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { suitsVolts } from '../utils/actuatorRules';
import { servoParts } from '../utils/engineeringPower';
import { prettyJointName } from '../utils/kinematics';
import { findPowerSources } from '../utils/powerSources';
import type { StudyKnob } from './types';

type ServoKnob = Extract<StudyKnob, { kind: 'servo' }>;

function actuatorChoices(part: ScenePart): string[] {
  const id = part.componentId;
  const component = part.kind === 'component' && id ? COMPONENT_BY_ID[id] : undefined;

  if (!component || !id) return [];

  const variants = (component.variants ?? []).filter((variant) => variant.actuator);
  const current = actuatorOf(id, part.componentVariant);
  const suffix = component.variants?.length && part.componentVariant ? `|${part.componentVariant}` : '';
  const chosen = current ? [`component:${id}${suffix}`] : [];
  const family = variants.map((variant) => `component:${id}|${variant.id}`);

  return [...new Set([...chosen, ...family])];
}

function jointKnob(joint: RobotJoint, byId: Map<string, ScenePart>): ServoKnob | null {
  const ids = joint.actuators ?? [];
  const assigned = ids.flatMap((id) => byId.get(id) ?? []);
  const choices = assigned.map(actuatorChoices);

  if (!assigned.length || assigned.length !== ids.length || choices.some((values) => !values.length)) return null;

  return {
    id: `servo-${joint.id}`,
    label: prettyJointName(joint.name),
    kind: 'servo',
    joints: [joint.id],
    values: [...new Set(choices.flat())],
  };
}

function ratedVolts(knobs: ServoKnob[]): number[] {
  const ratings = knobs
    .flatMap((knob) => knob.values)
    .flatMap((key) => {
      const [head, version] = key.split('|');
      const actuator = actuatorOf(head.replace(/^component:/, ''), version);

      return actuator ? [actuator.atVolts] : [];
    });

  return [...new Set(ratings)].sort((a, b) => a - b);
}

export function servoStudyKnobs(parts: ScenePart[], project: ProjectSettings): StudyKnob[] {
  const joints = servoLayout(project.joints ?? []).movable;
  const byId = new Map(parts.map((part) => [part.id, part]));
  const knobs = joints.flatMap((joint) => jointKnob(joint, byId) ?? []);
  const servos = servoParts(parts);

  if (!servos.length || findPowerSources({ parts, project }).length) return knobs;

  const grouped = new Set(joints.flatMap((joint) => joint.actuators ?? []));
  const others = servos
    .filter((part) => !grouped.has(part.id))
    .flatMap((part) => actuatorOf(part.componentId!, part.componentVariant) ?? []);
  const space = exploreSpace(parts, project);
  const current = supplyVolts(parts, project);
  const usable = ratedVolts(knobs).filter((volts) => others.every((actuator) => suitsVolts(actuator, volts)));
  const values = [...new Set([...(current === undefined ? [] : [current]), ...(space?.volts ?? []), ...usable])];

  return values.length ? [...knobs, { id: 'voltage', label: 'Voltage', kind: 'voltage', values }] : knobs;
}
