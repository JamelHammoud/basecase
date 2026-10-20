import React from 'react';
import { Button, FolderOpenIcon, IconButton, Section } from '../../design-system';
import type { BuildGuideRecord } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';
import { timeAgo } from '../../utils/timeAgo';
import type { BuildGuide } from '../../workspace/useBuildGuide';
import { plural } from './format';

interface GuideSectionProps {
  guide: BuildGuide;
  sceneName: string;
  canGenerate: boolean;
}

const GuideProgressRow: React.FC<{ guide: BuildGuide }> = ({ guide }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1 min-w-0">
      <div className="text-[12.5px] text-white/60 tabular-nums truncate">{guide.progress!.label}…</div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-label="Guide progress">
        <div
          className="h-full rounded-full bg-[#0d99ff] transition-[width] duration-200"
          style={{ width: `${Math.round(guide.progress!.share * 100)}%` }}
        />
      </div>
    </div>
    <Button size="sm" variant="secondary" onClick={guide.cancel}>
      Stop
    </Button>
  </div>
);

const CoverThumb: React.FC<{ record: BuildGuideRecord; sceneName: string; onOpen?: () => void }> = ({
  record,
  sceneName,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={!onOpen}
    aria-label="Open guide"
    className="relative w-[64px] h-[90px] shrink-0 rounded-[6px] bg-white overflow-hidden cursor-default transition-transform duration-150 enabled:active:scale-[0.96]"
  >
    <span className="absolute left-[5px] right-[5px] top-[5px] text-[7px] leading-[7px] font-extrabold uppercase text-black text-left truncate">
      {sceneName}
    </span>
    {record.coverDataUrl && (
      <img src={record.coverDataUrl} alt="" className="absolute inset-x-[4px] top-[16px] bottom-[10px] m-auto max-h-[64px] object-contain" />
    )}
  </button>
);

const GuideCard: React.FC<{ guide: BuildGuide; record: BuildGuideRecord; sceneName: string }> = ({
  guide,
  record,
  sceneName,
}) => {
  const canOpen = platformBridge.isElectron();

  return (
    <div className="flex items-center gap-3">
      <CoverThumb record={record} sceneName={sceneName} onOpen={canOpen ? guide.open : undefined} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-white/90 tabular-nums">
          {plural(record.pages, '1 page', `${record.pages} pages`)} · {plural(record.steps, '1 step', `${record.steps} steps`)}
        </div>
        <div className={`text-[12.5px] mt-0.5 ${guide.stale ? 'text-amber-400' : 'text-white/45'}`}>
          {guide.stale ? 'Out of date' : `Made ${timeAgo(record.generatedAt) === 'now' ? 'just now' : `${timeAgo(record.generatedAt)} ago`}`}
        </div>
        <div className="flex gap-2 mt-2.5">
          {canOpen && (
            <Button size="sm" variant={guide.stale ? 'secondary' : 'primary'} onClick={guide.open}>
              Open
            </Button>
          )}
          <Button size="sm" variant={guide.stale || !canOpen ? 'primary' : 'secondary'} onClick={() => void guide.generate()}>
            Regenerate
          </Button>
        </div>
      </div>
    </div>
  );
};

export const GuideSection: React.FC<GuideSectionProps> = ({ guide, sceneName, canGenerate }) => {
  const { record, progress } = guide;
  const reveal =
    record && !progress && platformBridge.isElectron() ? (
      <IconButton size="xs" title="Show in Finder" icon={<FolderOpenIcon className="w-4 h-4" />} onClick={guide.reveal} />
    ) : undefined;

  return (
    <Section title="Build guide" actions={reveal}>
      <div id="build-guide">
        {progress && <GuideProgressRow guide={guide} />}
        {!progress && record && <GuideCard guide={guide} record={record} sceneName={sceneName} />}
        {!progress && !record && (
          <Button variant="primary" fullWidth disabled={!canGenerate} onClick={() => void guide.generate()}>
            Generate Guide
          </Button>
        )}
      </div>
    </Section>
  );
};
