import type { Simulation } from '../../sim/useSimulation';

export type SimStats = NonNullable<Simulation['stats']>;

export type SimModel = NonNullable<Simulation['model']>;

export const worstJoints = (stats: SimStats) =>
  stats.joints
    .filter((j) => j.peak > 0.05)
    .sort((a, b) => b.peak - a.peak || b.saturatedS - a.saturatedS)
    .slice(0, 6);

export const floatingResults = (stats: SimStats, model: SimModel) =>
  stats.robots.filter((r) => model.robots.find((x) => x.key === r.key)?.floating);

export const hasRunResult = (stats: SimStats, model: SimModel) =>
  floatingResults(stats, model).length > 0 || worstJoints(stats).length > 0;
