import React, { useEffect, useEffectEvent, useState } from 'react';
import { sha256, type TryRecord } from '../cases/tries';
import { TRIES_TO_TRAIN } from '../skills/triesTraining';
import type { TrySummary } from '../cases/tryFile';
import { MenuItem, PlusIcon, SpreadsheetIcon, deleteEntry, type ContextMenuEntry } from '../design-system';
import type { Dataset } from '../datasets/datasetFile';
import { memberGroups, membersOf } from '../datasets/datasetView';
import type { SimModel } from '../sim/mjcfTypes';
import type { DatasetActions } from '../components/tries/DatasetPane';
import { showNewCase } from './caseCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

const enoughToTrain = (records: TryRecord[]) => records.filter((t) => t.passed).length >= TRIES_TO_TRAIN;

function useModelHash(build: () => Promise<SimModel>, key: string | null) {
  const [made, setMade] = useState<{ key: string; hash: string } | null>(null);
  const buildNow = useEffectEvent(() => build());

  useEffect(() => {
    if (!key) return;

    let live = true;

    buildNow()
      .then((model) => sha256(model.xml))
      .then((hash) => live && setMade({ key, hash }))
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [key]);

  return made && made.key === key ? made.hash : null;
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
  const others = view.datasets.filter((d) => d.id !== view.dataset?.id);
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

  return [
    { label: 'Make Dataset', icon: <SpreadsheetIcon />, onSelect: () => datasets.makeFromView(ids) },
    ...addTo,
    { divider: true },
    deleteEntry(() => view.remove(id), '⌫'),
  ];
}

export interface DatasetMode {
  dataset: Dataset | null;
  members: TrySummary[];
  fitting: TrySummary[];
  apart: TrySummary[];
  actions: DatasetActions | null;
  menu: (id: string) => ContextMenuEntry[];
}

export function useDatasetMode(core: WorkspaceCore): DatasetMode {
  const { triesView: view, datasets, simTraining } = core;
  const { cases, sim } = simTraining;
  const dataset = view.open ? view.dataset : null;
  const modelHash = useModelHash(sim.buildModel, dataset ? `${dataset.id}:${cases.active?.id ?? ''}` : null);
  const members = dataset ? membersOf(dataset, view.all) : [];
  const { fitting, apart } = memberGroups(members, modelHash);
  const { fromTries } = cases;

  return {
    dataset,
    members,
    fitting,
    apart,
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
    },
    menu: (id) => tileMenu(core, id),
  };
}
