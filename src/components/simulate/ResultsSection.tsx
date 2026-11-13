import React, { useState } from 'react';
import {
  Badge,
  Button,
  ContextMenu,
  DownloadIcon,
  IconButton,
  RunIcon,
  Section,
  ShareIcon,
  Tooltip,
  type ContextMenuEntry,
} from '../../design-system';
import { generatedFrom, type TryRecord } from '../../cases/tries';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';
import type { Simulation } from '../../sim/useSimulation';
import { prettyJointName, type Rig } from '../../utils/kinematics';
import type { Cases } from '../../workspace/useCases';
import type { CaseCompare } from '../../workspace/useCaseCompare';
import { CompareRows } from './CompareRows';
import { FAULT_LABEL } from './faultMenu';
import { FromTries } from './FromTries';
import type { ShareRobot } from '../../workspace/useShareRobot';
import { fmtTime } from './format';
import { ProgressBar } from './ProgressBar';
import { hasRunResult, RunResult, type OnFault } from './RunResult';
import { useFilmstrip } from './useFilmstrip';

interface TryRowProps {
  record: TryRecord;
  rig: Rig;
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
  generated: number;
  progress: number | null;
  onReplay: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

const outcome = (r: TryRecord) => (r.passed ? 'Passed' : 'Missed');

const Faults: React.FC<{ record: TryRecord; rig: Rig }> = ({ record, rig }) =>
  record.manifest.faults?.map((f) => (
    <Tooltip
      key={`${f.joint}-${f.at}`}
      label={`${prettyJointName(rig.byId.get(f.joint)?.name ?? f.joint)} at ${fmtTime(f.at)}`}
    >
      <span data-testid="try-fault">
        <Badge variant="amber">{FAULT_LABEL[f.kind]}</Badge>
      </span>
    </Tooltip>
  ));

const TryRow: React.FC<TryRowProps> = (props) => {
  const { record, rig, model, parts, world, generated, progress, onReplay, onMenu } = props;
  const film = useFilmstrip(record, model, parts, world);

  return (
    <div className="py-1.5 flex flex-col gap-1.5" onContextMenu={onMenu} data-testid="try-row">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={record.passed ? 'text-white/85' : 'text-[#f87171]'}>{outcome(record)}</span>
        <span className="text-white/50 tabular">{fmtTime(record.seconds)}</span>
        <span className="flex-1 text-white/50 tabular" data-testid="try-generated">
          {generated > 0 && `${generated} generated`}
        </span>
        <Faults record={record} rig={rig} />
        <IconButton icon={<RunIcon className="w-4 h-4" />} title="Replay" size="xs" onClick={onReplay} />
      </div>
      {progress !== null && <ProgressBar share={progress} />}
      {film && <img src={film} alt="" className="w-full h-14 object-cover rounded-[6px]" draggable={false} />}
    </div>
  );
};

export interface LatestRun {
  stats: NonNullable<Simulation['stats']>;
  model: SimModel;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
  onFault: OnFault;
}

interface ResultsProps {
  cases: Cases;
  rig: Rig;
  share?: ShareRobot;
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
  run: LatestRun | null;
  compare?: CaseCompare;
}

const DatasetActions: React.FC<{ cases: Cases }> = ({ cases }) => (
  <>
    <Button
      size="sm"
      fullWidth
      className="mt-2"
      disabled={cases.dataset.exporting}
      icon={<DownloadIcon className="w-4 h-4" />}
      title="Passed tries with camera video, for training GR00T or LeRobot"
      onClick={cases.dataset.exportDataset}
    >
      Export Dataset
    </Button>
    {cases.dataset.canPublish && (
      <Button
        size="sm"
        fullWidth
        className="mt-1.5"
        disabled={cases.dataset.exporting}
        icon={<ShareIcon className="w-4 h-4" />}
        onClick={cases.dataset.publishDataset}
      >
        Publish to Hugging Face
      </Button>
    )}
  </>
);

const TryActions: React.FC<{ cases: Cases }> = ({ cases }) => (
  <>
    {cases.dataset.canExport && <DatasetActions cases={cases} />}
    {cases.fromTries.shown && <FromTries fromTries={cases.fromTries} />}
  </>
);

const comparesCase = (cases: Cases, compare: CaseCompare | undefined) =>
  cases.active && compare && (compare.comparison || compare.running) ? compare : null;

export const ResultsSection: React.FC<ResultsProps> = ({ cases, rig, share, model, parts, world, run, compare }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const all = cases.active ? cases.tries : [];
  const tries = all.filter((t) => !t.generated);
  const { multiply } = cases;
  const progressOf = (t: TryRecord) =>
    multiply.running?.source === t.id ? multiply.running.done / multiply.running.total : null;
  const showRun = !!run && hasRunResult(run.stats, run.model);

  const comparing = comparesCase(cases, compare);

  if (!tries.length && !showRun && !share?.canShare && !comparing) return null;

  const openMenu = (e: React.MouseEvent, record: TryRecord) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(multiply.can(record) ? [{ label: 'Multiply', onSelect: () => multiply.multiply(record) }] : []),
        { label: 'Delete', tone: 'danger', onSelect: () => cases.removeTry(record) },
      ],
    });
  };

  return (
    <Section title="Results">
      {comparing && <CompareRows compare={comparing} />}
      {run && showRun && <RunResult {...run} />}
      {tries.length > 0 && (
        <div className="flex flex-col">
          {tries.map((t) => (
            <TryRow
              key={t.id}
              record={t}
              rig={rig}
              model={model}
              parts={parts}
              world={world}
              generated={generatedFrom(all, t).length}
              progress={progressOf(t)}
              onReplay={() => void cases.timeline.show(t)}
              onMenu={(e) => openMenu(e, t)}
            />
          ))}
        </div>
      )}
      {cases.active && <TryActions cases={cases} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </Section>
  );
};
