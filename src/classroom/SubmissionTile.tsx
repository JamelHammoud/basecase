import { SubmissionChecks } from './SubmissionChecks';
import { inspectSubmission } from './inspection';
import { CheckIcon } from '../components/build/CheckIcon';
import { Button } from '../design-system';
import { weight } from '../utils/weight';
import { type SubmissionTile as Tile } from './storage';
import type { Assignment } from './envelope';

function tileStatus(tile: Tile, running: boolean) {
  if (running) return 'checking';

  if (tile.result) return 'complete';

  return tile.error ? 'fail' : 'not run';
}

function tileIcon(tile: Tile, running: boolean) {
  if (running) return 'checking';

  if (tile.error || tile.result?.checks.some((check) => check.status === 'fail')) return 'fail';

  if (tile.result?.checks.some((check) => check.status === 'warn')) return 'warn';

  if (!tile.result || tile.result.checks.some((check) => check.check === 'Budget' && check.status === 'not run'))
    return 'not run';

  return 'pass';
}

export function SubmissionTile({
  tile,
  assignment,
  running,
  onRemove,
  onReplay,
  onError,
}: {
  tile: Tile;
  assignment: Assignment;
  running: boolean;
  onRemove: () => void;
  onReplay: () => void;
  onError: (error: unknown) => void;
}) {
  const { submission, result, error } = tile;
  const status = tileStatus(tile, running);
  const icon = tileIcon(tile, running);

  return (
    <article
      data-submission={submission.fingerprint}
      data-classroom-status={status}
      className="rounded-xl bg-[#262626] p-3 flex flex-col gap-3 min-w-0"
    >
      <div className="flex items-center gap-2">
        <CheckIcon status={icon} />
        <h2 className="text-[14px] font-medium truncate">{submission.name}</h2>
        <span className="ml-auto text-[12px] text-white/50">{submission.fingerprint.slice(0, 8)}</span>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-white/60">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <dl>
              <dt className="text-white/50">Estimated cost</dt>
              <dd>${result.costUsd.toFixed(2)}</dd>
            </dl>
            <p>{weight(result.massG)}</p>
            <dl>
              <dt className="text-white/50">Case</dt>
              <dd>
                {result.runs?.passes ?? 0}/{result.runs?.runs ?? 0}
              </dd>
            </dl>
          </div>
          {result.runs?.refusal && <p className="text-[13px] text-white/60">{result.runs.refusal}</p>}
          <SubmissionChecks checks={result.checks} />
        </>
      )}
      <div className="flex gap-2 mt-auto flex-wrap">
        <Button onClick={() => inspectSubmission(assignment, tile, onError)}>Open Scene</Button>
        {result?.runs?.worstSeed != null && !result.runs.refusal && <Button onClick={onReplay}>Replay</Button>}
        <Button variant="danger" onClick={onRemove}>
          Delete
        </Button>
      </div>
    </article>
  );
}
