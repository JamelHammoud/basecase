import { Button, FieldRow, NumberInput, Select } from '../../design-system';
import type { TrainingRequirement } from '../../vision/training/requirementTypes';

export function VisionRequirementFields({
  requirement,
  groups,
  classes,
  disabled,
  onChange,
  onDelete,
}: {
  requirement: TrainingRequirement;
  groups: TrainingRequirement['group'][];
  classes: string[];
  disabled: boolean;
  onChange: (next: TrainingRequirement) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="vision-requirement">
      <Select
        aria-label="Group"
        value={JSON.stringify(requirement.group)}
        disabled={disabled}
        options={groups.map((group) => ({
          value: JSON.stringify(group),
          label: `${group.kind === 'camera' ? 'Camera' : 'Condition'}: ${group.name}`,
        }))}
        onChange={(event) => onChange({ ...requirement, group: JSON.parse(event.target.value) })}
      />
      <Select
        aria-label="Class"
        value={requirement.classId ?? 'all'}
        disabled={disabled}
        options={[
          { value: 'all', label: 'All Classes' },
          ...classes.map((name, id) => ({ value: String(id), label: name })),
        ]}
        onChange={(event) => {
          const rest = { ...requirement };

          delete rest.classId;
          delete rest.className;

          onChange(
            event.target.value === 'all'
              ? rest
              : { ...rest, classId: Number(event.target.value), className: classes[Number(event.target.value)] },
          );
        }}
      />
      <FieldRow label="Score floor">
        <NumberInput
          aria-label="Score floor"
          value={requirement.minScore * 100}
          min={0}
          max={100}
          unit="%"
          disabled={disabled}
          onChange={(value) => onChange({ ...requirement, minScore: value / 100 })}
        />
      </FieldRow>
      <FieldRow label="Real test">
        <NumberInput
          aria-label="Minimum real test"
          value={requirement.minRealTest}
          min={1}
          max={1000}
          step={1}
          precision={0}
          unit=""
          disabled={disabled}
          onChange={(value) => onChange({ ...requirement, minRealTest: value })}
        />
      </FieldRow>
      <FieldRow label="Permitted regression">
        <NumberInput
          aria-label="Permitted regression"
          value={requirement.maxRegression * 100}
          min={0}
          max={100}
          unit="%"
          disabled={disabled}
          onChange={(value) => onChange({ ...requirement, maxRegression: value / 100 })}
        />
      </FieldRow>
      <Button variant="danger" disabled={disabled} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
