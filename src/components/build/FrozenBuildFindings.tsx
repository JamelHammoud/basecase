import type { FrozenKit } from '../../kit/frozenKit';
import type { ReadinessFinding } from '../../readiness/types';
import { ChecksSection } from './ChecksSection';
import { NoteRow, type FindingContext } from './FindingRow';

const ignore = () => {};

function retainedNote(key: string, text: string): ReadinessFinding {
  return {
    key,
    text,
    agentText: text,
    check: 'Checks',
    rule: key,
    ruleName: 'Checks',
    level: 'note',
    area: 'assembly',
    ids: [],
  };
}

export function FrozenBuildFindings({ kit }: { kit: FrozenKit }) {
  const { checks, guideEvidence, guide } = kit.manifest;
  const context: FindingContext = {
    parts: kit.parts,
    panScroll: false,
    readOnly: true,
    actions: { onIgnore: ignore, onIgnoreRule: ignore, onSelectParts: ignore },
  };
  const freshness = retainedNote('retained-checks', `Retained Checks: ${checks.freshness}`);
  const order = retainedNote('retained-order', 'Some assembly steps have an unproven order.');

  return (
    <div data-frozen-checks className="mt-2">
      <ul>
        <NoteRow finding={freshness} context={context} />
        {(guideEvidence.orderTimedOut || guide.steps.some((step) => step.unproven)) && (
          <NoteRow finding={order} context={context} />
        )}
      </ul>
      {checks.result && (
        <ChecksSection
          readiness={checks.result}
          checking={false}
          context={context}
          restore={{ onRestore: ignore, onRestoreRule: ignore }}
        />
      )}
    </div>
  );
}
