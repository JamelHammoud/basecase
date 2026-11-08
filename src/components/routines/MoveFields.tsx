import { FieldRow, Select } from '../../design-system';
import type { Motion } from '../../routines/schema';
import { moveTimeoutMs } from '../../routines/stepFactory';
import { skillLabel } from '../../routines/stepMenu';
import type { FieldProps } from './fieldTypes';
import { NumberField } from './NumberField';
import { TimeLimit } from './TimeLimit';

function SkillPicker({ node, skills, update }: Pick<FieldProps, 'node' | 'skills' | 'update'>) {
  const current = String(node.data.skill ?? '');
  const holds = (node.data.holds as string[] | undefined) ?? ['body'];
  const fitting = skills.filter((s) => s.holds.length === holds.length && s.holds.every((h) => holds.includes(h)));
  const ids = [...new Set([current, ...fitting.map((s) => s.id)])];

  return (
    <FieldRow label="Skill">
      <Select
        value={current}
        options={ids.map((id) => ({ value: id, label: skillLabel(id) }))}
        onChange={(e) => update({ skill: e.target.value })}
      />
    </FieldRow>
  );
}

function DriveFields({ node, update }: Pick<FieldProps, 'node' | 'update'>) {
  const move = node.data.move as Motion;
  const timeoutMs = Number(node.data.timeoutMs ?? 0);
  const set = (patch: Motion) => {
    const next = { ...move, ...patch };

    update({ move: next, timeoutMs: Math.max(timeoutMs, moveTimeoutMs(next)) });
  };

  if (move.turn !== undefined) {
    return (
      <NumberField
        label="Angle"
        value={move.turn}
        unit="°"
        min={-1080}
        max={1080}
        step={15}
        precision={0}
        onCommit={(turn) => set({ turn: turn === 0 ? 1 : turn })}
      />
    );
  }

  return (
    <>
      <NumberField
        label="Distance"
        value={move.distance ?? 1}
        unit="m"
        min={0.01}
        max={100}
        step={0.1}
        precision={2}
        onCommit={(distance) => set({ distance })}
      />
      <NumberField
        label="Speed"
        value={move.speed ?? 0.2}
        unit="m/s"
        min={0.01}
        max={2}
        step={0.05}
        precision={2}
        onCommit={(speed) => set({ speed })}
      />
      <NumberField
        label="Heading"
        value={move.heading ?? 0}
        unit="°"
        min={-180}
        max={180}
        step={15}
        precision={0}
        onCommit={(heading) => set({ heading })}
      />
    </>
  );
}

export function MoveFields(props: FieldProps) {
  const moving = props.node.data.move !== undefined;

  return (
    <>
      {moving ? <DriveFields {...props} /> : <SkillPicker {...props} />}
      <TimeLimit {...props} />
    </>
  );
}
