import { useState } from 'react';
import { Button, ProgressBar, Section } from '../../design-system';
import type { Study } from '../../workspace/useStudy';
import { StudyKnobField } from './StudyKnobField';
import { StudyRows } from './StudyRows';

export function StudySection({ study }: { study: Study }) {
  const [problems, setProblems] = useState<string[]>([]);

  if (!study.open && !study.shown) return null;

  return (
    <Section title="Study">
      {study.open && (
        <div className="flex flex-col gap-3 mb-3" data-testid="study-configure">
          {study.knobs.map((knob) => (
            <StudyKnobField
              key={knob.id}
              knob={knob}
              enabled={study.enabled.includes(knob.id)}
              disabled={study.running}
              onEnabled={(enabled) => study.enable(knob.id, enabled)}
              onChange={study.edit}
              onProblem={(problem) =>
                setProblems((s) => (problem ? [...new Set([...s, knob.id])] : s.filter((id) => id !== knob.id)))
              }
            />
          ))}
          <Button
            fullWidth
            variant="primary"
            size="md"
            disabled={!study.running && (!study.enabled.length || problems.some((id) => study.enabled.includes(id)))}
            onClick={study.running ? study.stop : study.start}
          >
            {study.running ? 'Stop Study' : 'Run Study'}
          </Button>
        </div>
      )}
      {study.running && <ProgressBar share={study.completed / Math.max(1, study.total)} className="mb-3" />}
      {study.shown && <StudyRows study={study} />}
    </Section>
  );
}
