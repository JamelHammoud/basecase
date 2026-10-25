import React, { useEffect } from 'react';
import { Button, FolderOpenIcon, IconButton, Section, settleTilt, tiltToward } from '../../design-system';
import { prefetchGuidePages } from '../../guide/viewer/guidePages';
import type { BuildGuideRecord } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';
import { timeAgo } from '../../utils/timeAgo';
import type { BuildGuide, GuideRunProgress } from '../../workspace/useBuildGuide';
import { plural } from './format';

interface GuideSectionProps {
  guide: BuildGuide;
  sceneName: string;
  canGenerate: boolean;
}

function timeLeft(seconds: number | undefined): string {
  if (seconds === undefined) return '';

  if (seconds < 10) return 'A few seconds left';

  if (seconds < 60) return `About ${Math.round(seconds / 5) * 5} s left`;

  return `About ${Math.round(seconds / 60)} min left`;
}

const CoverThumb: React.FC<{ cover?: string; sceneName: string; onOpen?: () => void }> = ({
  cover,
  sceneName,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={!onOpen}
    aria-label="Open guide"
    data-guide-cover
    onPointerMove={tiltToward}
    onPointerLeave={(e) => settleTilt(e.currentTarget)}
    className="tilt-card relative w-[64px] h-[90px] shrink-0 rounded-[6px] bg-white overflow-hidden cursor-default"
  >
    <span className="absolute left-[5px] right-[5px] top-[5px] text-[7px] leading-[7px] font-extrabold uppercase text-black text-left truncate">
      {sceneName}
    </span>
    {cover && (
      <img
        src={cover}
        alt=""
        className="absolute inset-x-[4px] top-[16px] bottom-[10px] m-auto max-h-[64px] object-contain animate-pop-in"
      />
    )}
  </button>
);

const Progress: React.FC<{ progress: GuideRunProgress; onStop: () => void }> = ({ progress, onStop }) => (
  <>
    <div className="text-[13px] text-white/90 tabular-nums truncate">{progress.label}…</div>
    <div className="text-[12.5px] mt-0.5 text-white/45 tabular-nums truncate">
      {timeLeft(progress.secondsLeft) || ' '}
    </div>
    <div className="mt-2 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-label="Guide progress">
      <div
        className="h-full rounded-full bg-[#0d99ff] transition-[width] duration-200"
        style={{ width: `${Math.round(progress.share * 100)}%` }}
      />
    </div>
    <div className="flex gap-2 mt-2.5">
      <Button size="sm" variant="secondary" onClick={onStop}>
        Stop
      </Button>
    </div>
  </>
);

const Made: React.FC<{ guide: BuildGuide; record: BuildGuideRecord; canOpen: boolean }> = ({
  guide,
  record,
  canOpen,
}) => {
  const ago = timeAgo(record.generatedAt);

  return (
    <>
      <div className="text-[13px] text-white/90 tabular-nums truncate">
        {plural(record.pages, '1 page', `${record.pages} pages`)}
      </div>
      <div className={`text-[12.5px] mt-0.5 ${guide.stale ? 'text-amber-400' : 'text-white/45'}`}>
        {guide.stale ? 'Out of date' : `Made ${ago === 'now' ? 'just now' : `${ago} ago`}`}
      </div>
      <div className="flex gap-2 mt-2.5">
        {canOpen && (
          <Button size="sm" variant={guide.stale ? 'secondary' : 'primary'} onClick={() => void guide.open()}>
            Open
          </Button>
        )}
        <Button
          size="sm"
          variant={guide.stale || !canOpen ? 'primary' : 'secondary'}
          onClick={() => void guide.generate()}
        >
          {guide.stale ? 'Update' : 'Regenerate'}
        </Button>
      </div>
    </>
  );
};

const GuideCard: React.FC<{ guide: BuildGuide; sceneName: string }> = ({ guide, sceneName }) => {
  const canOpen = !!guide.record && !guide.progress;

  return (
    <div className="flex items-center gap-3">
      <CoverThumb cover={guide.cover} sceneName={sceneName} onOpen={canOpen ? () => void guide.open() : undefined} />
      <div className="min-w-0 flex-1">
        {guide.progress && <Progress progress={guide.progress} onStop={guide.cancel} />}
        {!guide.progress && guide.record && <Made guide={guide} record={guide.record} canOpen={canOpen} />}
      </div>
    </div>
  );
};

export const GuideSection: React.FC<GuideSectionProps> = ({ guide, sceneName, canGenerate }) => {
  const { record, progress } = guide;
  const recordId = record?.id;
  const generatedAt = record?.generatedAt;

  useEffect(() => {
    if (!recordId || !generatedAt) return undefined;

    return prefetchGuidePages(recordId, generatedAt);
  }, [recordId, generatedAt]);

  const reveal =
    record && !progress && platformBridge.isElectron() ? (
      <IconButton size="xs" title="Show in Finder" icon={<FolderOpenIcon className="w-4 h-4" />} onClick={guide.reveal} />
    ) : undefined;

  return (
    <Section title="Build guide" actions={reveal}>
      <div id="build-guide">
        {(progress || record) && <GuideCard guide={guide} sceneName={sceneName} />}
        {!progress && !record && (
          <Button variant="primary" fullWidth disabled={!canGenerate} onClick={() => void guide.generate()}>
            Generate Guide
          </Button>
        )}
      </div>
    </Section>
  );
};
