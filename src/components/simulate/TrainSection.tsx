import React, { useId, useState } from 'react';
import { Button, Section, TextInput } from '../../design-system';
import type { SceneSkills } from '../../workspace/useSkills';
import { SkillsList, type SkillActions } from './SkillsList';

const TeachField: React.FC<{ examples: string[]; onTeach: (goal: string) => void }> = ({ examples, onTeach }) => {
  const [goal, setGoal] = useState('');
  const id = useId();
  const submit = () => {
    const text = goal.trim();

    if (!text) return;

    onTeach(text);
    setGoal('');
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="shrink-0 text-[13px] text-white/70" htmlFor={id}>
        Teach it to
      </label>
      <TextInput
        id={id}
        value={goal}
        placeholder={examples[0]}
        onChange={(e) => setGoal(e.target.value)}
        data-testid="teach-field"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={!goal.trim()}>
        Teach
      </Button>
    </form>
  );
};

export const TrainSection: React.FC<{
  skills: SceneSkills;
  actions: SkillActions;
  onTeach: ((goal: string) => void) | null;
}> = ({ skills, actions, onTeach }) => {
  if (!skills.available || (!onTeach && !skills.rows.length)) return null;

  return (
    <Section title="Train">
      <div className="flex flex-col gap-3">
        {onTeach && <TeachField examples={skills.examples} onTeach={onTeach} />}
        {skills.rows.length > 0 && <SkillsList rows={skills.rows} actions={actions} />}
      </div>
    </Section>
  );
};
