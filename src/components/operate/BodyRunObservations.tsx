import { TracePlot } from '../../design-system';
import type { RobotRun } from '../../robot/runBuffer';

export function BodyRunObservations({ run, units }: { run: RobotRun; units?: Array<'rad' | 'm'> }) {
  return (
    <div data-body-observations className="flex min-w-0 flex-col gap-2">
      {run.joints.map((joint, index) => (
        <div key={joint}>
          <p>{joint}</p>
          <TracePlot
            traces={[
              {
                id: joint,
                values: run.statuses.map((status) => status.positions[index] ?? NaN),
                x: run.statuses.map((status) => (status.at - run.statuses[0].at) / 1000),
                tone: 'primary',
              },
            ]}
            units={{ x: 's', y: units?.[index] ?? '' }}
          />
        </div>
      ))}
    </div>
  );
}
