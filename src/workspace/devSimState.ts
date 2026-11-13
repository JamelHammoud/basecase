import type { Controller } from '../sim/engine';
import { modelFingerprints } from '../sim/policyFreshness';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { linkParts, type Rig } from '../utils/kinematics';
import type { TryTimeline } from './useTryTimeline';
import type { WorkspaceCore } from './useWorkspaceCore';

const controllerState = (c: Controller) => ({
  kind: c.kind,
  clock: c.kind === 'policy' ? (c.policy.clock ?? null) : null,
});

function caseState({ cases }: WorkspaceCore['simTraining']) {
  return {
    activeCase: cases.active?.id ?? null,
    caseSeconds: cases.active?.task.seconds ?? null,
    tries: cases.tries.map((t) => ({
      passed: t.passed,
      margin: t.margin,
      seconds: t.seconds,
      faults: t.manifest.faults ?? [],
    })),
  };
}

const frameQpos = (r: Recording, frame: number) => Array.from(r.qpos.subarray(frame * r.nq, (frame + 1) * r.nq));

function timelineState(timeline: TryTimeline, sim: Simulation, rig: Rig) {
  const { recording } = timeline;

  if (!recording) return null;

  const sought = sim.sought();

  return {
    frame: timeline.frame,
    frames: timeline.frames,
    qpos: sought ? Array.from(sought.qpos) : null,
    sought: sought?.frame ?? null,
    lastQpos: frameQpos(recording, recording.frames - 1),
    lanes: timeline.lanes.map((l) => ({ joint: l.jointId, link: linkParts(rig, l.jointId) })),
    trips: timeline.trips,
  };
}

const DEG = 180 / Math.PI;

export function jointPositions(model: Simulation['model'], joints: Float64Array | null): Record<string, number> {
  if (!model || !joints) return {};

  return Object.fromEntries(
    model.joints.map((j, i) => [j.id, joints[i * 3 + 1] * (j.type === 'revolute' ? DEG : 1000)]),
  );
}

export function devSimState(core: WorkspaceCore) {
  const { sim, skills } = core.simTraining;
  const stats = sim.latestStats() ?? sim.stats;

  return {
    status: sim.status,
    playing: sim.playing,
    drive: sim.drive.status,
    driveClass: sim.drive.cls,
    offer: sim.drive.offer,
    stats,
    effector: stats?.effector ?? null,
    effectors: stats?.effectors ?? null,
    robots: sim.model?.robots.map((r) => r.key) ?? [],
    guests: sim.guestParts.map((p) => p.id),
    world: sim.worldParts.map((p) => p.id),
    bodies: sim.model?.bodies.map((b) => ({ parts: b.parts, world: b.world ?? [] })) ?? [],
    ...caseState(core.simTraining),
    selected: core.selectedIds,
    timeline: timelineState(core.simTraining.cases.timeline, sim, core.posing.rig),
    faults: Object.fromEntries(stats?.joints.flatMap((j) => (j.fault ? [[j.id, j.fault]] : [])) ?? []),
    facts: sim.latestFacts(),
    scanPoints: core.viewportRef.current?.scanPointCount() ?? 0,
    fingerprints: modelFingerprints(skills.model),
    controller: controllerState(sim.controller),
  };
}
