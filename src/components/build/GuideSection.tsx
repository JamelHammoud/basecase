import React from 'react';
import { Button, FolderOpenIcon, IconButton, ProgressBar, Section, settleTilt, tiltToward } from '../../design-system';
import type { GuidePages } from '../../guide/viewer/guidePages';
import type { BuildGuideRecord } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';
import { duration } from '../../utils/duration';
import { agoPhrase } from '../../utils/timeAgo';
import { REVEAL_LABEL } from '../../utils/os';
import type { BuildGuide, GuideRunProgress } from '../../workspace/useBuildGuide';
import { plural } from '../../../electron/plural.mjs';
import { GuideCoverPage } from './GuideCoverPage';
import { useGuidePages } from './useGuidePages';

interface GuideSectionProps {
  guide: BuildGuide;
  sceneName: string;
  canGenerate: boolean;
}

function timeLeft(seconds: number | undefined): string {
  if (seconds === undefined) return '';

  if (seconds < 10) return 'A few seconds left';

  return `About ${seconds < 60 ? duration(Math.round(seconds / 5) * 5) : duration(seconds, 'min')} left`;
}

const THUMB_W_PX = 64;

interface CoverThumbProps {
  cover?: string;
  page: GuidePages | null;
  sceneName: string;
  onOpen?: () => void;
}

const CoverThumb: React.FC<CoverThumbProps> = ({ cover, page, sceneName, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={!onOpen}
    aria-label="Open Build Guide"
    data-guide-cover
    onPointerMove={tiltToward}
    onPointerLeave={(e) => settleTilt(e.currentTarget)}
    className="tilt-card relative w-[64px] h-[90px] shrink-0 rounded-[6px] bg-white overflow-hidden cursor-default"
  >
    <span
      aria-hidden
      className="absolute left-[5px] right-[5px] top-[5px] text-[7px] leading-[7px] font-extrabold uppercase text-black text-left truncate">
      {sceneName}
    </span>
    {cover && (
      <img
        src={cover}
        alt=""
        className="absolute inset-x-[4px] top-[16px] bottom-[10px] m-auto max-h-[64px] object-contain animate-pop-in"
      />
    )}
    {page && <GuideCoverPage guide={page} widthPx={THUMB_W_PX} heroSrc={cover} />}
  </button>
);

const Progress: React.FC<{ progress: GuideRunProgress; onStop: () => void }> = ({ progress, onStop }) => (
  <>
    <div className="text-[13px] text-white/90 tabular-nums truncate">{progress.label}…</div>
    <div className="text-[12.5px] mt-0.5 text-white/50 tabular-nums truncate">
      {timeLeft(progress.secondsLeft) || ' '}
    </div>
    <ProgressBar className="mt-2" share={progress.share} label="Guide progress" />
    <div className="flex gap-2 mt-2.5">
      <Button size="sm" variant="secondary" onClick={onStop}>
        Stop
      </Button>
    </div>
  </>
);

const Made: React.FC<{ guide: BuildGuide; record: BuildGuideRecord }> = ({ guide, record }) => {
  return (
    <>
      <div className="text-[13px] text-white/90 tabular-nums truncate">
        {plural(record.pages, 'page')}
      </div>
      <div className={`text-[12.5px] mt-0.5 ${guide.stale ? 'text-amber-400' : 'text-white/50'}`}>
        {guide.stale ? 'Out of date' : `Made ${agoPhrase(record.generatedAt)}`}
      </div>
      <div className="flex gap-2 mt-2.5">
        <Button size="sm" variant={guide.stale ? 'secondary' : 'primary'} onClick={() => void guide.open()}>
          Open
        </Button>
        {guide.stale && (
          <Button size="sm" variant="primary" onClick={() => void guide.generate()}>
            Update
          </Button>
        )}
      </div>
    </>
  );
};

const GuideCard: React.FC<{ guide: BuildGuide; sceneName: string }> = ({ guide, sceneName }) => {
  const canOpen = !!guide.record && !guide.progress;
  const pages = useGuidePages(guide.record);

  return (
    <div className="flex items-center gap-3">
      <CoverThumb
        cover={guide.cover}
        page={guide.progress ? null : pages}
        sceneName={sceneName}
        onOpen={canOpen ? () => void guide.open() : undefined} />
      <div className="min-w-0 flex-1">
        {guide.progress && <Progress progress={guide.progress} onStop={guide.cancel} />}
        {!guide.progress && guide.record && <Made guide={guide} record={guide.record} />}
      </div>
    </div>
  );
};

export const GuideSection: React.FC<GuideSectionProps> = ({ guide, sceneName, canGenerate }) => {
  const { record, progress } = guide;
  const reveal =
    record && !progress && platformBridge.isElectron() ? (
      <IconButton size="xs" title={REVEAL_LABEL} icon={<FolderOpenIcon className="w-4 h-4" />} onClick={guide.reveal} />
    ) : undefined;

  return (
    <Section title="Build guide" actions={reveal}>
      <div id="build-guide">
        {(progress || record) && <GuideCard guide={guide} sceneName={sceneName} />}
        {!progress && !record && (
          <Button variant="primary" fullWidth disabled={!canGenerate} onClick={() => void guide.generate()}>
            Make Guide
          </Button>
        )}
      </div>
    </Section>
  );
};
