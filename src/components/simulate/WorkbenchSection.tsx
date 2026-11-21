import { useId, useState } from 'react';
import { DEFAULT_UNIT } from '../../../electron/robot/units.mjs';
import { FieldRow, Section, TextInput } from '../../design-system';
import { useFleet } from '../../robot/useRobot';
import type { CaseWorkbench } from '../../workspace/useCaseWorkbench';
import { WorkbenchPoseFields } from './WorkbenchPoseFields';

export function WorkbenchSection({ workbench }: { workbench: CaseWorkbench }) {
  const fleet = useFleet();
  const [unit, setUnit] = useState<string>(workbench.placements[0]?.unit ?? fleet.selected ?? DEFAULT_UNIT);
  const list = useId();

  if (!workbench.available) return null;

  const record = workbench.placements.find((own) => own.unit === unit);
  const names = [...new Set([...fleet.units.map((own) => own.unit), ...workbench.placements.map((own) => own.unit)])];

  return (
    <Section title="Workbench placement" collapsible open={workbench.open} onOpenChange={workbench.setOpen}>
      <div className="flex flex-col gap-2" data-testid="workbench-placement">
        <FieldRow label="Unit">
          <TextInput
            value={unit}
            list={list}
            disabled={workbench.busy}
            onChange={(event) => setUnit(event.target.value)}
          />
        </FieldRow>
        <p className="text-[12px] text-white/50">Root joint datum in the workbench frame</p>
        <datalist id={list}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <WorkbenchPoseFields
          key={`${workbench.caseId}:${unit}:${record?.fingerprint ?? ''}`}
          workbench={workbench}
          unit={unit}
          initial={record?.pose ?? { position: workbench.pivot, yawDeg: 0 }}
          record={record}
        />
      </div>
    </Section>
  );
}
