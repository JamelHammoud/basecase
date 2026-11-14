import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Section, TextInput } from '../../design-system';
import type { SceneSkills } from '../../workspace/useSkills';
import type { CoachScope } from '../../workspace/useSkillCoach';
import type { Training } from '../../sim/useTraining';
import type { PolicyRecord } from '../../types/robotics';
import { PolicyList, type PolicyActions } from './PolicyList';
import { SkillsList, type SkillActions } from './SkillsList';

export type CoachSend = (scope: CoachScope, words: string) => void;

interface TeachFieldProps {
  examples: string[];
  onTeach: (goal: string) => void;
  scope: CoachScope | null;
  onCoach: CoachSend;
  onEndScope: () => void;
}

const TeachField: React.FC<TeachFieldProps> = ({ examples, onTeach, scope, onCoach, onEndScope }) => {
  const [goal, setGoal] = useState('');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const submit = () => {
    const text = goal.trim();

    if (!text) return;

    if (scope) {
      onCoach(scope, text);
      onEndScope();
    } else onTeach(text);

    setGoal('');
  };

  useEffect(() => {
    if (scope) input.current?.focus();
  }, [scope]);

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="shrink-0 max-w-[40%] truncate text-[13px] text-white/70" htmlFor={id}>
        {scope ? scope.label : 'Teach it to'}
      </label>
      <TextInput
        ref={input}
        id={id}
        value={goal}
        placeholder={scope ? undefined : examples[0]}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && scope) {
            e.stopPropagation();
            onEndScope();
          }
        }}
        data-testid="teach-field"
        data-coach={scope?.target}
      />
      <Button type="submit" variant="secondary" size="sm" disabled={!goal.trim()}>
        {scope ? 'Coach' : 'Teach'}
      </Button>
    </form>
  );
};

const liveScope = (skills: SceneSkills) => {
  const { scope } = skills.coach;

  return scope && skills.rows.some((r) => r.target === scope.target && r.state.kind === 'ready') ? scope : null;
};

export const TrainSection: React.FC<{
  skills: SceneSkills;
  actions: SkillActions;
  margin: number | null;
  onTeach: ((goal: string) => void) | null;
  onCoach: CoachSend | null;
  policies: PolicyRecord[];
  training: Training;
  policyActions: PolicyActions;
}> = ({ skills, actions, margin, onTeach, onCoach, policies, training, policyActions }) => {
  const showsSkills = skills.available && (onTeach !== null || skills.rows.length > 0);

  if (!showsSkills && !policies.length) return null;

  return (
    <Section title="Train">
      <div className="flex flex-col gap-3">
        {skills.available && onTeach && (
          <TeachField
            examples={skills.examples}
            onTeach={onTeach}
            scope={onCoach ? liveScope(skills) : null}
            onCoach={onCoach ?? (() => undefined)}
            onEndScope={skills.coach.end}
          />
        )}
        {skills.available && skills.rows.length > 0 && (
          <SkillsList rows={skills.rows} actions={actions} margin={margin} />
        )}
        {policies.length > 0 && <PolicyList policies={policies} training={training} actions={policyActions} />}
      </div>
    </Section>
  );
};
