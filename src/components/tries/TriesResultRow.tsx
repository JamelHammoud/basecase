import React from 'react';
import type { TriesResult } from '../../workspace/useTriesTraining';

export const TriesResultRow: React.FC<{ result: TriesResult }> = ({ result }) => (
  <div className="py-1.5 flex flex-col gap-1.5" data-testid="tries-policy" data-kept={result.kept}>
    <span className={`text-[13px] tabular ${result.kept ? 'text-white/85' : 'text-[#f87171]'}`}>
      {result.passes} of {result.runs}
    </span>
    {result.film && (
      <img src={result.film} alt="" className="w-full h-14 object-cover rounded-[6px]" draggable={false} />
    )}
  </div>
);
