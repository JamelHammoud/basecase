import { fastenerInput } from '../../assembly/fastenerSpec';
import { traceFasteners } from '../../assembly/fastenerChain';
import { jointsWithChains } from '../../assembly/rigJoints';
import type { PortVec } from '../../types/ports';
import { analyzeWiring } from '../../wiring/routeAnalysis';
import type { WiringScene } from '../../wiring/netlist';
import type { Placed } from './collide';

export function wiringOf(placed: Placed[], scene: WiringScene) {
  const chains = scene.project.joints?.length ? traceFasteners(placed, fastenerInput(scene.parts)) : null;
  const joints = jointsWithChains(scene.project.joints ?? [], scene.parts, chains);

  return analyzeWiring(
    { ...scene, project: { ...scene.project, joints } },
    placed.map(({ id, box }) => ({ id, min: box.min.toArray() as PortVec, max: box.max.toArray() as PortVec })),
  );
}
