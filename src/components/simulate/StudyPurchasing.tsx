import type { StudyRow } from '../../study/types';
import { StudyPurchasingDetails } from './StudyPurchasingDetails';

export function StudyPurchasing({ row, selected, scene }: { row: StudyRow; selected: boolean; scene: string }) {
  const result = row.purchasing;

  if (!result) return null;

  const status = result.purchasingComplete
    ? 'Purchasing evidence complete'
    : [...new Set(result.lines.flatMap((item) => item.issues))].join(', ');

  return (
    <>
      <span className="col-span-4 text-[12px] text-white/60">{status}</span>
      {selected && <StudyPurchasingDetails result={result} scene={scene} />}
    </>
  );
}
