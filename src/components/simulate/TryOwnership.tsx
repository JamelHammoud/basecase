import type { Recording } from '../../sim/recorder';
import { runClock } from '../../utils/duration';
import type { AppliedOwner } from '../../sim/teaching';

const OWNER_LABEL: Record<AppliedOwner, string> = { policy: 'Policy', operator: 'Correction', context: 'Context' };

export function TryOwnership({ recording }: { recording: Recording | null }) {
  const teaching = recording?.teaching;

  if (!teaching?.ownership?.length) return null;

  return (
    <div className="flex flex-col gap-1 text-[13px]" data-testid="try-ownership" data-policy={teaching.policy}>
      <code className="text-white/60 break-all">{teaching.policy}</code>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {teaching.ownership.map((interval, index) => (
          <div key={index} className="flex max-w-full flex-wrap gap-x-2" data-owner={interval.owner}>
            <dt>{OWNER_LABEL[interval.owner]}</dt>
            <dd className="shrink-0 whitespace-nowrap tabular text-white/60">
              {runClock(interval.at)}–{runClock(interval.until)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
