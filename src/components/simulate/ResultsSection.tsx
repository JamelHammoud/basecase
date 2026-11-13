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
import type { TryRecord } from '../../cases/tries';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';
import type { Simulation } from '../../sim/useSimulation';
import { prettyJointName, type Rig } from '../../utils/kinematics';
import type { Cases } from '../../workspace/useCases';
import { FAULT_LABEL } from './faultMenu';
import type { ShareRobot } from '../../workspace/useShareRobot';
import { fmtTime } from './format';
import { hasRunResult, RunResult, type OnFault } from './RunResult';
import { useFilmstrip } from './useFilmstrip';

interface TryRowProps {
  record: TryRecord;
  rig: Rig;
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
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

const TryRow: React.FC<TryRowProps> = ({ record, rig, model, parts, world, onReplay, onMenu }) => {
  const film = useFilmstrip(record, model, parts, world);

  return (
    <div className="py-1.5 flex flex-col gap-1.5" onContextMenu={onMenu} data-testid="try-row">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={record.passed ? 'text-white/85' : 'text-[#f87171]'}>{outcome(record)}</span>
        <span className="flex-1 text-white/50 tabular">{fmtTime(record.seconds)}</span>
        <Faults record={record} rig={rig} />
        <IconButton icon={<RunIcon className="w-4 h-4" />} title="Replay" size="xs" onClick={onReplay} />
      </div>
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
  share: ShareRobot;
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
  run: LatestRun | null;
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

export const ResultsSection: React.FC<ResultsProps> = ({ cases, rig, share, model, parts, world, run }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const tries = cases.active ? cases.tries : [];
  const showRun = !!run && hasRunResult(run.stats, run.model);

  if (!tries.length && !showRun && !share.canShare) return null;

  const openMenu = (e: React.MouseEvent, record: TryRecord) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Delete', tone: 'danger', onSelect: () => cases.removeTry(record) }],
    });
  };

  return (
    <Section title="Results">
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
              onReplay={() => void cases.replay(t)}
              onMenu={(e) => openMenu(e, t)}
            />
          ))}
        </div>
      )}
      {cases.active && cases.dataset.canExport && <DatasetActions cases={cases} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </Section>
  );
};
