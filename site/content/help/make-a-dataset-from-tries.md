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

A dataset collects tries from any scene under one name. You can export it, publish it or train a policy on it. You can make one from a Case's results or from a Library search.

## From a Case's results

1. Open a Case and record tries with **Try It** until at least one passes. See [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**.

![Make Dataset under the Results of Touch a Point](/help/make-a-dataset-from-tries/results.png)

The dataset opens over the canvas with the Case's passed tries in it. It takes its name and task from the Case's name and brief.

Or press [[⌘K]] while the Case is open and choose **Make Dataset**.

## From a Library search

1. Click **Library** in the view rail on the left.
2. In the search box at the top, type a Case's name, a robot's name, Variation or Real.
3. Under **Tries**, click a robot. Tries fills the canvas with the tries that match your search.

![Tries showing only the tries that match Touch a Point in the Library search](/help/make-a-dataset-from-tries/search.png)

4. Press [[⌘K]] and choose **Make Dataset**.

The dataset holds every try on screen and keeps your search. If the scene has the Case those tries came from, the dataset takes that Case's name. If it doesn't, the dataset takes the name of your search.

To make a dataset from only some of the tries, hold [[⌘]] or [[⇧]] as you select them, then right-click one and choose **Make Dataset**.

## The dataset

Above its tries, the dataset shows their total running time and its newest version.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

- **Export Dataset** saves a LeRobot zip. See [Export a LeRobot dataset](/help/export-a-lerobot-dataset).
- **Publish to Hugging Face** puts the dataset on the Hub. See [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- **Train from Tries** appears once five of its tries have passed. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).

**Note:** Publish to Hugging Face and Train from Tries are available in the desktop app.

Missed tries stay in the dataset, but export, publishing and training leave them out. They also leave out the tries listed under [Tries that export leaves out](#tries-that-export-leaves-out).

A dataset holds whole tries, with no segments, labels or tags. To step through one try, see [Open a try from any scene](/help/open-a-try-from-any-scene).

The Library lists each dataset under **Datasets** with its number of tries. Click one to open it.

![Two datasets named Touch a Point under Datasets in the Library](/help/make-a-dataset-from-tries/library.png)

To delete a dataset, right-click it in the Library, choose **Delete**, then click **Delete** to confirm. You keep its tries.

## Update and Add to Dataset

A dataset you made from a search has an **Update** button. Click it to run the search again and refill the dataset with the tries that match at that moment.

![A dataset made from a search, with Update beside Export Dataset](/help/make-a-dataset-from-tries/searched.png)

To add tries to another dataset, right-click a try, choose **Add to Dataset** and pick the dataset. A toast shows the count, for example "Added 2 tries to Touch a Point".

![The Add to Dataset submenu on a try, listing Touch a Point](/help/make-a-dataset-from-tries/add.png)

## Versions

Each time you export, publish or train, Basecase saves the dataset's tries as a version. If you haven't changed the tries, they keep their version. Any change to them starts the next version.

The newest version shows above the tries, for example Version 2. If you publish Version 2, the Hub tags it `dataset-v2`.

## Tries that export leaves out

Export, publishing and training use the tries you recorded in the open Case on the robot's current design. One export holds the joints of one robot and the world of one Case. Other tries move to the end of the dataset, and export, publishing and training leave them out.

- A try recorded before the robot last changed shows under "These tries are from an earlier design. Try It again to record new ones."
- A try from another Case or scene shows under "These tries are from another Case or scene."
