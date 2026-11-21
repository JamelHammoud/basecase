import { useState } from 'react';
import { Button, Modal, TextInput, Spinner } from '../design-system';
import { timeAgo } from '../utils/timeAgo';
import { VersionComparisonPanel } from './VersionComparisonPanel';
import type { WorkspaceCore } from './useWorkspaceCore';

export function SceneHistorySheet({ core }: { core: WorkspaceCore }) {
  const { versions } = core;
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? versions.view?.head;
  const row = versions.view?.rows.find((version) => version.id === selected);
  const activeRuns = Object.keys(versions.view?.activeRuns ?? {}).length > 0;

  return (
    <Modal
      isOpen={versions.open}
      onClose={versions.close}
      title="Scene history"
      headerActions={
        versions.busy ? (
          <span className="absolute right-[60px] top-[22px]">
            <Spinner className="w-4 h-4 text-white/90" />
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" aria-busy={versions.busy}>
        <div className="flex items-center gap-2">
          <TextInput
            aria-label="Version name"
            maxLength={200}
            placeholder="e.g. Shorter legs"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={versions.busy || !name.trim()}
            onClick={() =>
              void versions.perform(async () => {
                const saved = await versions.capture(name.trim());

                setChosen(saved.head);
                setName('');
              })
            }
          >
            Save Version
          </Button>
        </div>
        <div className="flex flex-col max-h-[240px] overflow-y-auto">
          {versions.view?.rows.map((version) => (
            <div key={version.id} className="flex items-center gap-3">
              <Button
                className="flex-1 justify-start"
                variant={selected === version.id ? 'active' : 'ghost'}
                aria-pressed={selected === version.id}
                onClick={() => setChosen(version.id)}
              >
                {version.label}
              </Button>
              <span className="text-[12px] text-white/50 tabular">{timeAgo(version.at)}</span>
            </div>
          ))}
        </div>
        {row && <code className="text-[12px] text-white/50 break-all">{row.fingerprint}</code>}
        <div className="flex gap-2">
          <Button
            disabled={!row || versions.busy || activeRuns}
            onClick={() => void versions.perform(() => versions.restore(row!.id))}
          >
            Restore
          </Button>
          <Button
            disabled={!row || versions.busy}
            onClick={() =>
              void versions.perform(async () => {
                const seed = await versions.branch(row!.id);

                versions.close();
                core.studio.newScene(seed);
              })
            }
          >
            Branch
          </Button>
        </div>
        <VersionComparisonPanel core={core} />
        {versions.problem && (
          <p role="alert" className="text-[13px] text-red-400">
            {versions.problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
