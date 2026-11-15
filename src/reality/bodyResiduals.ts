import type { RobotRun } from '../robot/runBuffer';

export type BodyResidual = (predicted: number[][]) => Float64Array;

function residualFor(run: RobotRun, frames: number[], joints: number[]): BodyResidual {
  const measured = new Float64Array(frames.length * joints.length);
  let at = 0;

  for (const frame of frames) {
    for (const joint of joints) measured[at++] = run.statuses[frame].positions[joint]!;
  }

  return (predicted) => {
    const out = new Float64Array(measured.length);
    let at = 0;

    for (const frame of frames) {
      for (const joint of joints) {
        out[at] = predicted[frame][joint] - measured[at];
        at++;
      }
    }

    return out;
  };
}

export function prepareBodyResiduals(run: RobotRun, selected: number[]) {
  const midpoint = (run.statuses[0].at + run.statuses.at(-1)!.at) / 2;
  const fit: number[] = [];
  const check: number[] = [];
  const joints = [...selected];

  run.statuses.forEach((status, index) => {
    if (index > 0) (status.at < midpoint ? fit : check).push(index);
  });

  return { fit: residualFor(run, fit, joints), check: residualFor(run, check, joints) };
}
