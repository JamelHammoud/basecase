import type { WorkspaceCore } from './useWorkspaceCore';

export async function replayFall(core: WorkspaceCore, deg: number) {
  const { sim } = core.simTraining;

  core.tool.setRightTab('sim');

  if (!sim.modelNow()) await sim.start();

  sim.setController({ kind: 'hold' });
  sim.reset();
  sim.play();
  sim.push(undefined, deg);
}
