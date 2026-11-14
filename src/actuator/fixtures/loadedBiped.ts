import { fixtureMeasures } from '../../sim/fixtures/parts';
import { fallBiped, LOADED_BODY_G } from '../../sim/fixtures/fallBiped';
import type { MeshMeasure } from '../../three/meshMeasure';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../../types/robotics';
import { runEngineering } from '../../utils/engineering';
import type { ActuatorScene } from '../actuatorBuild';

export const loadedBiped = (): ActuatorScene => {
  const robot = fallBiped('c001', LOADED_BODY_G);

  return { parts: robot.parts, joints: robot.joints };
};

export function worldMeasures(parts: ScenePart[]): Record<string, MeshMeasure> {
  const local = fixtureMeasures(parts);

  return Object.fromEntries(
    parts.map((p) => {
      const m = local[p.id];
      const at = (v: [number, number, number]) => v.map((x, i) => x + p.position[i]) as [number, number, number];

      return [p.id, { ...m, min: at(m.min), max: at(m.max) }];
    }),
  );
}

export const projectOf = (scene: ActuatorScene, project: Partial<ProjectSettings> = {}): ProjectSettings => ({
  ...DEFAULT_PROJECT,
  ...project,
  joints: scene.joints,
});

export const engineeringOf = (scene: ActuatorScene, project: Partial<ProjectSettings> = {}) =>
  runEngineering({
    parts: scene.parts,
    project: projectOf(scene, project),
    measures: worldMeasures(scene.parts),
    servoOutputs: {},
  });
