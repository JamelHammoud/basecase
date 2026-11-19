import { plural } from '../../../electron/plural.mjs';
import { negative } from '../../../electron/minus.mjs';
import { Button, FieldRow, NumberInput, Section, Spinner } from '../../design-system';
import type { ArmWorkspace } from '../../workspace/useArmWorkspace';
import type { V3 } from '../../utils/kinematics';

export function WorkspaceSection({ workspace }: { workspace: ArmWorkspace }) {
  const { view } = workspace;

  if (!view) return null;

  const samples = view.samples;
  const count = samples ? samples.positions.length / 3 : 0;
  const at = view.selected === null ? null : samples?.positions.slice(view.selected * 3, view.selected * 3 + 3);

  return (
    <Section title="Workspace">
      <div className="flex flex-col gap-3 text-[13px] text-white/60">
        <p>Tool point at rest</p>
        <div className="grid grid-cols-3 gap-2">
          {(['X', 'Y', 'Z'] as const).map((label, i) => (
            <NumberInput
              key={label}
              label={label}
              value={view.point[i]}
              unit="mm"
              onChange={(value) =>
                workspace.resample(view.point.map((v, k) => (k === i ? value : v)) as V3, view.budget)
              }
            />
          ))}
        </div>
        <FieldRow label="Configurations">
          <NumberInput
            unit=""
            value={view.budget}
            min={1}
            max={8192}
            precision={0}
            onChange={(budget) => workspace.resample(view.point, budget)}
          />
        </FieldRow>
        {view.busy && <Spinner className="w-4 h-4" />}
        {samples && <p data-testid="workspace-samples">{plural(count, 'position')}</p>}
        {samples && <p>Sampled endpoints. Other positions are unknown.</p>}
        {count > 0 && (
          <FieldRow label="Sample">
            <NumberInput
              unit=""
              value={view.selected === null ? null : view.selected + 1}
              min={1}
              max={count}
              precision={0}
              disabled={view.busy}
              onChange={(index) => workspace.select(index - 1)}
            />
          </FieldRow>
        )}
        {at && <p>{`${Array.from(at, (v) => negative(v, (n) => n.toFixed(2))).join(', ')} mm`}</p>}
        {view.problem && (
          <p className="text-amber-400" role="status">
            {view.problem}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={view.busy || view.selected === null} onClick={workspace.plan}>
            Plan Motion
          </Button>
          <Button size="sm" variant="ghost" shortcut="Esc" onClick={workspace.close}>
            Close Workspace
          </Button>
        </div>
      </div>
    </Section>
  );
}
