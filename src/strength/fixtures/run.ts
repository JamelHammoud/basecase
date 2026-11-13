import { objectsOf } from '../../assembly/assembly.fixtures';
import { fastenerInput } from '../../assembly/fastenerSpec';
import { jointsWithChains } from '../../assembly/rigJoints';
import { portsOf, worldPort } from '../../agent/ports';
import { fastenersIn, measuresIn, strengthIn } from '../../three/analysis/analysisPool';
import { snapshotShapes, type SceneShapes } from '../../three/analysis/sceneShapes';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { runEngineering, STRENGTH_CHECK } from '../../utils/engineering';
import type { EngineeringInputs, ServoOutput } from '../../utils/engineeringTypes';
import type { StrengthJob, StrengthReading } from '../types';

function declaredOutputs(parts: ScenePart[]): Record<string, ServoOutput> {
  return Object.fromEntries(
    parts.flatMap((p) => {
      const port = portsOf(p).find((x) => x.kind === 'output');
      const at = port && worldPort(p, port);

      return at ? [[p.id, { point: at.position, axis: at.axis }]] : [];
    }),
  );
}

interface CpuTime {
  user: number;
  system: number;
}

const cpuUsage = (since?: CpuTime): CpuTime =>
  (globalThis as unknown as { process: { cpuUsage: (since?: CpuTime) => CpuTime } }).process.cpuUsage(since);

export async function solveCpuMs(scene: SceneShapes, job: StrengthJob): Promise<number> {
  const fresh = { ...job, load: { ...job.load, torqueNmm: job.load.torqueNmm * 1.001 } };
  const before = cpuUsage();

  await strengthIn(scene, [fresh]);

  const { user, system } = cpuUsage(before);

  return (user + system) / 1000;
}

export async function strengthReport({ parts, project }: { parts: ScenePart[]; project: ProjectSettings }) {
  const scene = snapshotShapes(objectsOf(parts));
  const [chains, measures] = await Promise.all([fastenersIn(scene, fastenerInput(parts)), measuresIn(scene)]);
  const input: EngineeringInputs = {
    parts,
    project: { ...project, joints: jointsWithChains(project.joints ?? [], parts, chains) },
    measures,
    servoOutputs: declaredOutputs(parts),
    chains,
  };
  const jobs: StrengthJob[] = [];

  runEngineering({
    ...input,
    strength: (asked) => {
      jobs.push(...asked);

      return asked.map(() => null);
    },
  });

  const readings: Array<StrengthReading | null> = await strengthIn(scene, jobs);
  const byKey = new Map(jobs.map((j, i) => [j.key, readings[i]]));
  const report = runEngineering({ ...input, strength: (asked) => asked.map((j) => byKey.get(j.key) ?? null) });

  return { row: report.rows.find((r) => r.check === STRENGTH_CHECK), readings, jobs, scene };
}
