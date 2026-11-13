import React from 'react';
import { Button, TrainIcon } from '../../design-system';
import type { TriesResult, TriesTraining } from '../../workspace/useTriesTraining';
import { PendingRow } from './PendingRow';

const Result: React.FC<{ result: TriesResult }> = ({ result }) => (
  <div className="py-1.5 flex flex-col gap-1.5" data-testid="tries-policy" data-kept={result.kept}>
    <span className={`text-[13px] tabular ${result.kept ? 'text-white/85' : 'text-[#f87171]'}`}>
      {result.passes} of {result.runs}
    </span>
    {result.film && (
      <img src={result.film} alt="" className="w-full h-14 object-cover rounded-[6px]" draggable={false} />
    )}
  </div>
);

export const FromTries: React.FC<{ fromTries: TriesTraining }> = ({ fromTries }) => (
  <div className="mt-2 flex flex-col">
    {fromTries.training && <PendingRow />}
    {fromTries.result && <Result result={fromTries.result} />}
    <Button
      size="sm"
      fullWidth
      disabled={!fromTries.ready}
      icon={<TrainIcon className="w-4 h-4" />}
      onClick={fromTries.train}
    >
      Train From Tries
    </Button>
  </div>
);
