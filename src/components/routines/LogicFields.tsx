import type React from 'react';
import { FieldRow, SegmentedControl, Select } from '../../design-system';
import { describeCondition } from '../../routines/explainGraph';
import { MODEL_NODES } from '../../routines/nodes';
import type { Condition, Routine } from '../../routines/schema';
import { allSteps } from '../../routines/schema';
import { inferStep, SENSED_FACTS, watcherFor } from '../../routines/stepFactory';
import { type FieldProps, seconds } from './fieldTypes';
import { NumberField } from './NumberField';
import { TextField } from './TextField';
import { TimeLimit } from './TimeLimit';

type Leaf = { fact: string; is: boolean };

const isBooleanLeaf = (c: unknown): c is Leaf =>
  typeof c === 'object' && c !== null && 'fact' in c && typeof (c as { is?: unknown }).is === 'boolean';

function factOptions(routine: Routine, current: string) {
  const sensed = SENSED_FACTS.map((s) => ({ value: s.fact, label: s.label }));
  const own = [
    ...routine.watchers.map((w) => w.id),
    ...allSteps(routine).flatMap((s) => (s.kind === 'infer' || s.kind === 'ask' ? [s.id ?? ''] : [])),
    current,
  ].filter((id) => id && !sensed.some((s) => s.value === id));

  return [...sensed, ...[...new Set(own)].map((id) => ({ value: id, label: id }))];
}

function IfFields({ node, routine, apply, update }: FieldProps) {
  const test = node.data.test as Condition;

  if (!isBooleanLeaf(test)) {
    return (
      <FieldRow label="When">
        <span className="text-[13px] text-white/80">{describeCondition(test)}</span>
      </FieldRow>
    );
  }

  const pickFact = (fact: string) => {
    const watcher = watcherFor(fact);
    const needsWatcher = watcher && !routine.watchers.some((w) => w.id === fact);

    apply([
      ...(needsWatcher ? [{ op: 'addWatcher' as const, watcher }] : []),
      { op: 'update', id: node.id, patch: { test: { fact, is: test.is } } },
    ]);
  };

  return (
    <>
      <FieldRow label="When">
        <Select
          value={test.fact}
          options={factOptions(routine, test.fact)}
          onChange={(e) => pickFact(e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Is">
        <SegmentedControl
          value={test.is ? 'yes' : 'no'}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          onChange={(v) => update({ test: { fact: test.fact, is: v === 'yes' } })}
        />
      </FieldRow>
    </>
  );
}

function WaitFields({ node, update }: FieldProps) {
  const timeoutMs = Number(node.data.timeoutMs ?? 0);

  return (
    <>
      {node.data.ms !== undefined && (
        <NumberField
          label="Wait"
          value={seconds(node.data.ms)}
          unit="s"
          min={0.1}
          max={600}
          step={0.5}
          precision={1}
          onCommit={(s) => update({ ms: Math.round(s * 1000), timeoutMs: Math.max(timeoutMs, s * 1000 + 1000) })}
        />
      )}
      <TimeLimit node={node} update={update} />
    </>
  );
}

function AskFields({ node, update }: FieldProps) {
  const answers = (node.data.answers as string[] | undefined) ?? [];

  return (
    <>
      <TextField label="Question" value={String(node.data.prompt ?? '')} onCommit={(prompt) => update({ prompt })} />
      <TextField
        label="Answers"
        value={answers.join(', ')}
        placeholder="e.g. Yes, No"
        onCommit={(text) =>
          update({
            answers: [
              ...new Set(
                text
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean),
              ),
            ],
          })
        }
      />
      <TimeLimit node={node} update={update} />
    </>
  );
}

const SENSES = MODEL_NODES.filter((m) => m.tier === 'perception' && m.outputs.length > 0);

function InferFields({ node, update }: FieldProps) {
  const pick = (model: string) => {
    const step = inferStep(node.id, model);

    if (step) update({ model: step.model, input: step.input, output: step.output });
  };

  return (
    <>
      <FieldRow label="Model">
        <Select
          value={String(node.data.model)}
          options={SENSES.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(e) => pick(e.target.value)}
        />
      </FieldRow>
      <TimeLimit node={node} update={update} />
    </>
  );
}

function TogetherFields({ node, update }: FieldProps) {
  return (
    <FieldRow label="Finish">
      <SegmentedControl
        value={String(node.data.join)}
        options={[
          { value: 'all', label: 'All' },
          { value: 'any', label: 'First' },
        ]}
        onChange={(join) => update({ join })}
      />
    </FieldRow>
  );
}

function WatcherFields({ node, update }: FieldProps) {
  return (
    <NumberField
      label="Rate"
      value={Number(node.data.rateHz ?? 10)}
      unit="Hz"
      min={1}
      max={30}
      step={1}
      precision={0}
      onCommit={(rateHz) => update({ rateHz, maxAgeMs: Math.max(Number(node.data.maxAgeMs ?? 0), 2000 / rateHz) })}
    />
  );
}

function ReactionFields({ node, update }: FieldProps) {
  return (
    <>
      <NumberField
        label="Cooldown"
        value={seconds(node.data.cooldownMs)}
        unit="s"
        min={0}
        max={600}
        step={1}
        precision={1}
        onCommit={(s) => update({ cooldownMs: Math.round(s * 1000) })}
      />
      <FieldRow label="Body">
        <SegmentedControl
          value={String(node.data.body)}
          options={[
            { value: 'keepGoing', label: 'Keep Going' },
            { value: 'stopFirst', label: 'Stop First' },
          ]}
          onChange={(body) => update({ body })}
        />
      </FieldRow>
    </>
  );
}

const SAY = (props: FieldProps) => (
  <>
    <TextField label="Say" value={String(props.node.data.text ?? '')} onCommit={(text) => props.update({ text })} />
    <TimeLimit node={props.node} update={props.update} />
  </>
);

const BY_KIND: Record<string, (props: FieldProps) => React.ReactNode> = {
  say: SAY,
  ask: AskFields,
  wait: WaitFields,
  if: IfFields,
  together: TogetherFields,
  infer: InferFields,
  watcher: WatcherFields,
  reaction: ReactionFields,
};

export function LogicFields(props: FieldProps) {
  const Fields = BY_KIND[props.node.kind];

  return Fields ? <Fields {...props} /> : null;
}
