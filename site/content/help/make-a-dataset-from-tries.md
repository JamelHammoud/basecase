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

A dataset gathers tries from any scene under one name. You can export it, publish it or train a policy on it.

## From a Case's results

1. Open a Case and record tries with **Try It** until at least one passes. For the steps, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**.

![Make Dataset under the Results of Touch a Point](/help/make-a-dataset-from-tries/results.png)

The dataset opens over the canvas with the Case's passed tries. It takes its name and task from the Case's name and brief.

You can also choose **Make Dataset** in [[⌘K]] while the Case is open.

## From a Library search

1. Click **Library** in the view rail on the left.
2. Type in the search box at the top. You can search for a Case's name, a robot's name, Variation or Real.
3. Under **Tries**, click a robot. Tries fills the canvas and shows only the tries that match your search.

![Tries showing only the tries that match Touch a Point in the Library search](/help/make-a-dataset-from-tries/search.png)

4. Press [[⌘K]] and choose **Make Dataset**.

The dataset holds every try on screen and keeps your search. If the scene has the Case those tries came from, the dataset takes that Case's name. Otherwise, it's named after your search.

To make a dataset from only some of the tries, hold [[⌘]] or [[⇧]] while you select them. Then right-click one of them and choose **Make Dataset**.

## The dataset

Above its tries, the dataset shows their total running time and its newest version.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

- **Export Dataset** saves a LeRobot zip. See [Export a LeRobot dataset](/help/export-a-lerobot-dataset).
- **Publish to Hugging Face** puts the dataset on the Hub. See [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- **Train from Tries** appears once five of its tries have passed. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).

**Note:** Publish to Hugging Face and Train from Tries are available in the desktop app.

Export, publishing and training leave out missed tries and tries recorded on an earlier design of the robot. A missed try still stays in the dataset.

A dataset holds whole tries. It has no segments, labels or tags. To step through one try, see [Open a try from any scene](/help/open-a-try-from-any-scene).

The Library lists every dataset under **Datasets**, with the number of tries in each. Click a dataset to reopen it.

![Two datasets named Touch a Point under Datasets in the Library](/help/make-a-dataset-from-tries/library.png)

To delete a dataset, right-click it in the Library, choose **Delete**, then confirm with **Delete**. Deleting a dataset doesn't delete its tries.

## Update and Add to Dataset

A dataset made from a search has an **Update** button. Click it to run the search again and refill the dataset with the tries that match now.

![A dataset made from a search, with Update beside Export Dataset](/help/make-a-dataset-from-tries/searched.png)

To add tries to a different dataset, right-click a try, choose **Add to Dataset** and pick the dataset. A toast shows the count, for example "Added 2 tries to Touch a Point".

![The Add to Dataset submenu on a try, listing Touch a Point](/help/make-a-dataset-from-tries/add.png)

## Versions

Each export, publish or training run saves the dataset's tries as a version. If the tries haven't changed, they keep their version. Any change to them makes the next version.

The newest version shows above the tries, for example Version 2. When you publish Version 2, the Hub tags it `dataset-v2`.

## Tries that export leaves out

Export, publishing and training use tries recorded in the open Case, on the robot as it is now. One export holds one robot's joints and one Case's world. Other tries move to the end of the dataset, and all three leave them out.

- A try recorded before the robot last changed shows under "These tries are from an earlier design. Try It again to record new ones."
- A try from another Case or scene shows under "These tries are from another Case or scene."
