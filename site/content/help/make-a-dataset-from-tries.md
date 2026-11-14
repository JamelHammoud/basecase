---
title: Make a dataset from tries
date: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - dataset
  - datasets
  - demonstrations
  - episodes
  - training data
  - search
  - version
  - lerobot
related:
  - open-a-try-from-any-scene
  - export-a-lerobot-dataset
covers:
  - src/components/simulate/ResultsSection.tsx
  - src/components/tries/
  - src/components/library/DatasetsSection.tsx
  - src/components/LibraryPanel.tsx
  - src/workspace/useCaseDataset.ts
  - src/workspace/useDatasets.ts
  - src/workspace/useDatasetMode.tsx
  - src/workspace/useDatasetRecords.ts
  - src/workspace/datasetCommands.tsx
  - src/workspace/useTriesView.ts
  - src/cases/tryQuery.ts
  - src/datasets/datasetFile.ts
  - src/datasets/datasetView.ts
  - src/datasets/datasetStore/
  - electron/library/datasetStore.mjs
---

Gather tries from any scene into one named dataset, then export it, publish it or train a policy on it.

## From a Case's results

1. Open a Case and record tries with **Try It** until at least one passes. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**.


The dataset opens over the canvas. It holds the Case's passed tries, takes the Case's name, and uses its brief as the task.

**Make Dataset** is also in [[⌘K]] while the Case is open.

## From a Library search

1. Click **Library** in the view rail on the left.
2. Type in the search box at the top, such as a Case's name, a robot's name, Variation or Real.
3. Under **Tries**, click a robot. Tries fills the canvas with only the tries your search matches.


4. Press [[⌘K]] and choose **Make Dataset**.

The dataset holds every try shown and keeps your search. It takes the name of the Case its tries came from when this scene has it, else your search.

To make one from some tries only, select them with [[⌘]] or [[⇧]] held, then right-click one and choose **Make Dataset**.

## The dataset

Above its tries, the dataset shows its episodes, their total time, the tries for each robot, how many passed and missed, how many are variations or real, and its version.


Its buttons take it further:

- **Export Dataset** saves a LeRobot zip; see [Export a LeRobot dataset](/help/export-a-lerobot-dataset).
- **Publish to Hugging Face** puts it on the Hub, in the desktop app; see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- **Train from Tries** shows once five tries in it passed, in the desktop app; see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

Only passed tries recorded on the robot as it is now go out or train. A missed try stays in the dataset, but is left out of both.

Every dataset is listed under **Datasets** in the Library, with its count of tries. Click one to open it again.


## Update and Add to Dataset

A dataset made from a search has **Update**. Click it to run the search again, so the dataset holds the tries that match now.

To add tries to another dataset, right-click a try, choose **Add to Dataset** and pick the dataset. The toast counts them, such as "Added 2 tries to Touch a Point".


## Versions

Each export, publish and training saves the dataset's tries as a version. The same tries keep the same version, and any change makes the next one. The newest shows above the tries, such as Version 2. A publish tags it on the Hub as `dataset-v2`.

## Tries from an earlier design

A try recorded before the robot last changed moves to the end of the dataset, under "These tries are from an earlier design. Try It again to record new ones." It stays in the dataset, but export and training leave it out, since one dataset holds one joint layout.

A dataset holds whole tries, with no segments, labels or tags.

To delete a dataset, right-click it in the Library, choose **Delete** and click **Delete** again to confirm. Its tries stay. To step through one try, see [Open a try from any scene](/help/open-a-try-from-any-scene).
