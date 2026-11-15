import type { ScenePart } from '../../types/robotics';
import type { Netlist, WiringScene } from '../../wiring/connectors';
import type { Instance } from './analysisOps';

export function wiringCache() {
  const scenes = new WeakMap<ScenePart[], Map<string, Promise<Netlist>>>();

  return (instances: Instance[], scene: WiringScene, run: () => Promise<Netlist>): Promise<Netlist> => {
    const { joints, wiring, extras, tether, sourced } = scene.project;
    const key = JSON.stringify([instances, joints, wiring, extras, tether, sourced]);
    const entries = scenes.get(scene.parts) ?? new Map<string, Promise<Netlist>>();
    const kept = entries.get(key);

    if (kept) return kept;

    const promise = run().catch((error: unknown) => {
      entries.delete(key);

      throw error;
    });

    if (entries.size >= 8) entries.delete(entries.keys().next().value!);

    entries.set(key, promise);
    scenes.set(scene.parts, entries);

    return promise;
  };
}
