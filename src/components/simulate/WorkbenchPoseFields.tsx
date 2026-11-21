import { useState } from 'react';
import { Button, NumberInput, RunIcon, Spinner, Tooltip } from '../../design-system';
import type { WorkbenchPose } from '../../cases/workbench/placement';
import type { CaseWorkbench } from '../../workspace/useCaseWorkbench';
import type { RetainedPlacement } from '../../cases/workbench/retention';
import { failureText } from '../../readiness/caseChecks';
import { MISSED } from '../../cases/caseRuns';

export function WorkbenchPoseFields({
  workbench,
  unit,
  initial,
  record,
}: {
  workbench: CaseWorkbench;
  unit: string;
  initial: WorkbenchPose;
  record?: RetainedPlacement;
}) {
  const [pose, setPose] = useState(initial);
  const same =
    record &&
    pose.yawDeg === record.pose.yawDeg &&
    pose.position.every((value, index) => value === record.pose.position[index]);
  const rehearsal = same && workbench.current(record) ? record.rehearsal : null;
  const position = (index: number, value: number, live?: boolean) => {
    if (live) return;

    const next: WorkbenchPose['position'] = [...pose.position];

    next[index] = value;
    setPose({ ...pose, position: next });
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {['X', 'Y', 'Z'].map((label, index) => (
          <NumberInput
            key={label}
            label={label}
            value={pose.position[index]}
            min={-100000}
            max={100000}
            disabled={workbench.busy}
            onChange={(value, live) => position(index, value, live)}
          />
        ))}
      </div>
      <NumberInput
        label="Yaw"
        value={pose.yawDeg}
        unit="°"
        min={-360}
        max={360}
        disabled={workbench.busy}
        onChange={(yawDeg, live) => {
          if (!live) setPose({ ...pose, yawDeg });
        }}
      />
      <Button
        variant="secondary"
        fullWidth
        disabled={workbench.busy || !unit}
        icon={workbench.busy ? <Spinner /> : <RunIcon />}
        onClick={() => void workbench.run(unit, pose)}
      >
        Rehearse
      </Button>
      {workbench.busy && (
        <Button variant="secondary" fullWidth onClick={workbench.cancel}>
          Cancel
        </Button>
      )}
      {same && (
        <Tooltip
          label={
            <span className="flex flex-col">
              <span>{`Case ${record.caseHash.slice(0, 8)}`}</span>
              <span>{`Robot ${record.robotHash.slice(0, 8)}`}</span>
            </span>
          }
        >
          <output
            tabIndex={0}
            className="text-[13px] text-white/60"
            data-workbench-evidence="entered"
            data-unit={unit}
            data-case-hash={record.caseHash}
            data-robot-hash={record.robotHash}
            data-placement-fingerprint={record.fingerprint}
            data-passed={rehearsal?.passed}
          >
            <span>Entered</span>
            {rehearsal && (
              <p className={rehearsal.passed ? 'text-white/90' : 'text-red-400'}>
                {rehearsal.refusal ?? (rehearsal.passed ? 'Passed' : failureText(rehearsal.failed[0] ?? MISSED))}
              </p>
            )}
          </output>
        </Tooltip>
      )}
    </>
  );
}
