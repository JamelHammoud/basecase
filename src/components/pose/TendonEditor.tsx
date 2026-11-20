import { useState } from 'react';
import { TendonLawFields } from './TendonLawFields';
import { Button, FieldRow, Modal, NumberInput, Select } from '../../design-system';
import type { IdealTendon, TendonTerm } from '../../types/tendon';
import type { RobotJoint } from '../../types/robotics';
import { errorMessage } from '../../utils/errorMessage';

interface Props {
  motor: RobotJoint;
  outputs: RobotJoint[];
  onSave: (tendon: IdealTendon) => void;
  onDelete: () => void;
  onClose: () => void;
}

const termOf = (joint: RobotJoint): TendonTerm => ({
  joint: joint.id,
  coefficient: joint.type === 'prismatic' ? 1 : 10,
  unit: joint.type === 'prismatic' ? 'mm/mm' : 'mm/rad',
});

export function TendonEditor({ motor, outputs, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<IdealTendon>(() =>
    structuredClone(
      motor.tendon ?? {
        spool: { coefficient: -10, unit: 'mm/rad' },
        terms: outputs.length ? [termOf(outputs[0])] : [],
        law: { kind: 'fixed', lengthMm: 0 },
      },
    ),
  );
  const [problem, setProblem] = useState('');
  const [nextJoint, setNextJoint] = useState('');
  const available = outputs.filter((j) => !draft.terms.some((term) => term.joint === j.id));
  const save = () => {
    try {
      onSave(draft);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };
  const changeCoefficient = (index: number, coefficient: number) =>
    setDraft({
      ...draft,
      terms: draft.terms.map((term, i) => (i === index ? { ...term, coefficient } : term)),
    });

  return (
    <Modal
      isOpen
      title="Ideal tendon"
      subtitle={motor.name}
      onClose={onClose}
      action={{ label: 'Save', onClick: save }}
      footerStart={
        motor.tendon && (
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-5">
        <FieldRow label="Spool">
          <NumberInput
            aria-label="Spool coefficient"
            value={draft.spool.coefficient}
            precision={6}
            unit="mm/rad"
            onChange={(coefficient) => setDraft({ ...draft, spool: { coefficient, unit: 'mm/rad' } })}
          />
        </FieldRow>
        {draft.terms.map((term, i) => {
          const name = outputs.find((j) => j.id === term.joint)?.name ?? term.joint;

          return (
            <FieldRow key={term.joint} label={name}>
              <NumberInput
                aria-label={`${name} coefficient`}
                value={term.coefficient}
                precision={6}
                unit={term.unit}
                onChange={(value) => changeCoefficient(i, value)}
              />
            </FieldRow>
          );
        })}
        {available.length > 0 && (
          <div className="flex gap-2">
            <Select
              aria-label="Joint"
              value={nextJoint || available[0].id}
              options={available.map((j) => ({ value: j.id, label: j.name }))}
              onChange={(e) => setNextJoint(e.target.value)}
            />
            <Button
              onClick={() => {
                const joint = available.find((j) => j.id === nextJoint) ?? available[0];

                setDraft({ ...draft, terms: [...draft.terms, termOf(joint)] });
                setNextJoint('');
              }}
            >
              Add Joint
            </Button>
          </div>
        )}
        <TendonLawFields law={draft.law} onChange={(law) => setDraft({ ...draft, law })} />
        {problem && (
          <p role="alert" className="text-[13px] text-red-400">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
