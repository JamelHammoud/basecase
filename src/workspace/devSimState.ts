import type { Controller } from '../sim/engine';
import { modelFingerprints } from '../sim/policyFreshness';
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
    faults: Object.fromEntries(stats?.joints.flatMap((j) => (j.fault ? [[j.id, j.fault]] : [])) ?? []),
    facts: sim.latestFacts(),
    scanPoints: core.viewportRef.current?.scanPointCount() ?? 0,
    fingerprints: modelFingerprints(skills.model),
    controller: controllerState(sim.controller),
  };
}
