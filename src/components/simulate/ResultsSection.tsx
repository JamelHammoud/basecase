import React, { useState } from 'react';
import {
  Button,
  ContextMenu,
  DownloadIcon,
  IconButton,
  RunIcon,
  Section,
  ShareIcon,
  type ContextMenuEntry,
} from '../../design-system';
import type { TryRecord } from '../../cases/tries';
import type { SimModel } from '../../sim/mjcfTypes';
import type { Simulation } from '../../sim/useSimulation';
import type { ScenePart } from '../../types/robotics';
import type { Rig } from '../../utils/kinematics';
import type { Cases } from '../../workspace/useCases';
import { fmtTime } from './format';
import { hasRunResult } from './resultRows';
import { RunResult } from './RunResult';
import { useFilmstrip } from './useFilmstrip';

interface TryRowProps {
  record: TryRecord;
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
  onReplay: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

const outcome = (r: TryRecord) => (r.passed ? 'Passed' : 'Missed');

const TryRow: React.FC<TryRowProps> = ({ record, model, parts, world, onReplay, onMenu }) => {
  const film = useFilmstrip(record, model, parts, world);

  return (
    <div className="py-1.5 flex flex-col gap-1.5" onContextMenu={onMenu} data-testid="try-row">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={record.passed ? 'text-white/85' : 'text-[#f87171]'}>{outcome(record)}</span>
        <span className="flex-1 text-white/50 tabular">{fmtTime(record.seconds)}</span>
        <IconButton icon={<RunIcon className="w-4 h-4" />} title="Replay" size="xs" onClick={onReplay} />
      </div>
      {film && <img src={film} alt="" className="w-full h-14 object-cover rounded-[6px]" draggable={false} />}
    </div>
  );
};

const TryList: React.FC<{ cases: Cases; model: SimModel | null; parts: ScenePart[]; world: ScenePart[] }> = ({
  cases,
  model,
  parts,
  world,
}) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const openMenu = (e: React.MouseEvent, record: TryRecord) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Delete', tone: 'danger', onSelect: () => cases.removeTry(record) }],
    });
  };

  return (
    <div className="flex flex-col">
      {cases.tries.map((t) => (
        <TryRow
          key={t.id}
          record={t}
          model={model}
          parts={parts}
          world={world}
          onReplay={() => void cases.replay(t)}
          onMenu={(e) => openMenu(e, t)}
        />
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};

const DatasetButtons: React.FC<{ dataset: Cases['dataset'] }> = ({ dataset }) => (
  <>
    {dataset.canExport && (
      <Button
        size="sm"
        fullWidth
        disabled={dataset.exporting}
        icon={<DownloadIcon className="w-4 h-4" />}
        title="Passed tries with camera video, for training GR00T or LeRobot"
        onClick={dataset.exportDataset}
      >
        Export Dataset
      </Button>
    )}
    {dataset.canPublish && (
      <Button
        size="sm"
        fullWidth
        disabled={dataset.exporting}
        icon={<ShareIcon className="w-4 h-4" />}
        onClick={dataset.publishDataset}
      >
        Publish to Hugging Face
      </Button>
    )}
  </>
);

interface ResultsProps {
  cases: Cases;
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  onSelectParts: (ids: string[]) => void;
}

export const ResultsSection: React.FC<ResultsProps> = ({ cases, sim, rig, parts, onSelectParts }) => {
  const { stats, model } = sim;
  const run = sim.status !== 'off' && stats && model && hasRunResult(stats, model) ? { stats, model } : null;
  const tries = cases.active ? cases.tries.length : 0;

  if (!run && !tries) return null;

  return (
    <Section title="Results">
      <div className="flex flex-col gap-1.5">
        {run && <RunResult stats={run.stats} model={run.model} rig={rig} onSelectParts={onSelectParts} />}
        {tries > 0 && <TryList cases={cases} model={model} parts={parts} world={sim.worldParts} />}
        {tries > 0 && <DatasetButtons dataset={cases.dataset} />}
      </div>
    </Section>
  );
};
