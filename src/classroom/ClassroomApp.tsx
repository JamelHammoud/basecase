import { useState } from 'react';
import { Button, ConfirmHost, TextInput } from '../design-system';
import { useClassroom } from './useClassroom';
import { SubmissionTile } from './SubmissionTile';
import { ClassroomReplay } from './ClassroomReplay';
import type { SubmissionTile as Tile } from './storage';

export function ClassroomApp() {
  const work = useClassroom();
  const { value } = work;
  const [name, setName] = useState('');
  const [replay, setReplay] = useState<Tile | null>(null);
  const importing = !work.loaded || work.busy || !!work.running;
  const run = (task: Promise<unknown>) => void task.catch(work.report);

  return (
    <main
      className="h-screen overflow-y-auto bg-[#1b1b1b] text-white/90 p-6 text-[14px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();

        if (!importing) run(work.importSubmissions(Array.from(e.dataTransfer.files)));
      }}
    >
      <header className="flex gap-3 items-center flex-wrap mb-6">
        <h1 className="text-[20px] font-medium mr-auto">{value?.assignment.bundle.title ?? 'Classroom'}</h1>
        <label className="text-[13px] flex gap-2 items-center">
          <span>Assignment file</span>
          <input
            aria-label="Assignment file"
            type="file"
            accept=".caseclass,application/json"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];

              if (file) run(work.importAssignment(file));

              e.target.value = '';
            }}
          />
        </label>
      </header>
      {value && (
        <>
          <div className="flex gap-3 items-center flex-wrap mb-6">
            <div className="w-48">
              <TextInput
                aria-label="Name"
                placeholder="e.g. Ada"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button disabled={importing || !name.trim()} onClick={() => run(work.start(name))}>
              Start Attempt
            </Button>
            <label className="text-[13px] flex gap-2 items-center">
              <span>Submission files</span>
              <input
                aria-label="Submission files"
                type="file"
                accept=".casesubmit,application/json"
                multiple
                disabled={importing}
                onChange={(e) => {
                  run(work.importSubmissions(Array.from(e.target.files ?? [])));
                  e.target.value = '';
                }}
              />
            </label>
            {work.running ? (
              <Button onClick={work.cancel}>Cancel</Button>
            ) : (
              <Button disabled={importing || !value.submissions.length} onClick={() => run(work.grade())}>
                Grade
              </Button>
            )}
          </div>
          <p className="text-[13px] text-white/50 mb-6">
            Reference controller. Budget ${value.assignment.budgetUsd}. Fingerprints detect changed content, not
            authorship.
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {value.submissions.map((tile) => (
              <SubmissionTile
                key={tile.submission.fingerprint}
                tile={tile}
                assignment={value.assignment}
                running={work.running === tile.submission.fingerprint}
                onRemove={() => work.remove(tile)}
                onReplay={() => {
                  work.cancel();
                  setReplay(tile);
                }}
                onError={work.report}
              />
            ))}
          </div>
        </>
      )}
      {work.errors.map((error, i) => (
        <p key={i} role="alert" className="mt-3 text-[13px] text-white/60">
          {error}
        </p>
      ))}
      {value && replay && (
        <ClassroomReplay assignment={value.assignment} tile={replay} onClose={() => setReplay(null)} />
      )}
      <ConfirmHost />
    </main>
  );
}
