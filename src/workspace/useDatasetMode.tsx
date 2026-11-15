import React, { useEffect, useEffectEvent, useState } from 'react';
import { sha256, type TryRecord } from '../cases/tries';
import { TRIES_TO_TRAIN } from '../skills/triesTraining';
import type { TrySummary } from '../cases/tryFile';
import {
  MenuItem,
  PlusIcon,
  SpreadsheetIcon,
  deleteEntry,
  moreLikeThisEntry,
  type ContextMenuEntry,
} from '../design-system';
import type { Dataset } from '../datasets/datasetFile';
import { datasetVersionGroups, datasetVersionMembers } from './datasetVersionView';
import type { SimModel } from '../sim/mjcfTypes';
import type { DatasetActions } from '../components/tries/DatasetPane';
import { showNewCase } from './caseCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

const enoughToTrain = (records: TryRecord[]) => records.filter((t) => t.passed).length >= TRIES_TO_TRAIN;

interface ModelKey {
  id: string | null;
  robot: unknown;
}

function useModelHash(build: () => Promise<SimModel>, { id, robot }: ModelKey) {
  const [made, setMade] = useState<{ id: string; robot: unknown; hash: string } | null>(null);
  const buildNow = useEffectEvent(() => build());

  useEffect(() => {
    if (!id) return;

    let live = true;

    buildNow()
      .then((model) => sha256(model.xml))
      .then((hash) => live && setMade({ id, robot, hash }))
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [id, robot]);

  return made && made.id === id && made.robot === robot ? made.hash : null;
}

const DatasetItems: React.FC<{ datasets: Dataset[]; onPick: (d: Dataset) => void }> = ({ datasets, onPick }) => (
  <>
    {datasets.map((d) => (
      <MenuItem key={d.id} label={d.name} onSelect={() => onPick(d)} />
    ))}
  </>
);

function tileMenu(core: WorkspaceCore, id: string): ContextMenuEntry[] {
  const { triesView: view, datasets } = core;
  const ids = view.selected.includes(id) ? view.selected : [id];
  const others = view.datasets.filter((d) => d.id !== view.dataset?.id && ids.some((t) => !d.members.includes(t)));
  const addTo: ContextMenuEntry[] = others.length
    ? [
        {
          label: 'Add to Dataset',
          icon: <PlusIcon />,
          submenuWidth: 220,
          submenu: (close) => (
            <DatasetItems
              datasets={others}
              onPick={(d) => {
                close();
                datasets.add(d, ids);
              }}
            />
          ),
        },
      ]
    : [];

  const like = view.dataset ? [] : [moreLikeThisEntry(() => view.like(id))];

  return [
    ...like,
    { label: 'Make Dataset', icon: <SpreadsheetIcon />, onSelect: () => datasets.makeFromView(ids) },
    ...addTo,
    deleteEntry(() => view.remove(id), '⌫'),
  ];
}

export interface DatasetMode {
  dataset: Dataset | null;
  members: TrySummary[];
  fitting: TrySummary[];
  earlier: TrySummary[];
  elsewhere: TrySummary[];
  actions: DatasetActions | null;
  menu: (id: string) => ContextMenuEntry[];
}

export function useDatasetMode(core: WorkspaceCore): DatasetMode {
  const { triesView: view, datasets, simTraining } = core;
  const { cases, sim } = simTraining;
  const dataset = view.open ? view.dataset : null;
  const modelHash = useModelHash(sim.buildModel, {
    id:
      dataset?.members.length && dataset.selectedVersion === undefined
        ? `${dataset.id}:${cases.active?.id ?? ''}`
        : null,
    robot: core.posing.rig,
  });
  const members = dataset ? datasetVersionMembers(dataset, view.all) : [];
  const { fitting, earlier, elsewhere } = datasetVersionGroups(dataset, members, {
    modelHash,
    sceneId: cases.sceneId,
    caseId: cases.active?.id ?? null,
  });
  const { fromTries } = cases;

  return {
    dataset,
    members,
    fitting,
    earlier,
    elsewhere,
    actions: dataset && {
      exporting: cases.dataset.exporting,
      canPublish: cases.dataset.canPublish,
      canTrain: fromTries.canTrain && enoughToTrain(cases.dataset.records.of(dataset)),
      trainBusy: fromTries.busy,
      training: fromTries.training === dataset.id,
      result: fromTries.resultFor(dataset),
      exportDataset: () => datasets.exportDataset(dataset),
      publishDataset: () => datasets.publishDataset(dataset),
      train: () => datasets.train(dataset, () => showNewCase(core)),
      update: () => datasets.update(dataset),
      selectVersion: view.selectVersion,
    },
    menu: (id) => tileMenu(core, id),
  };
}
