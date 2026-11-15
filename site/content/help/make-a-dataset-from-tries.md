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
  - src/datasets/datasetFile.ts
  - src/datasets/datasetView.ts
  - src/datasets/datasetSnapshot.ts
  - src/datasets/snapshotTypes.ts
  - src/datasets/snapshotSplits.ts
  - src/datasets/snapshotImages.ts
  - src/workspace/datasetVersionView.ts
  - src/datasets/datasetStore/
  - electron/library/datasetStore.mjs
---

You can gather tries from any scene into a named dataset, then export it, publish it or train a policy on it.

You can make one from a Case's results or from a search of your tries.

## From a Case's results

1. Open a Case and record tries with **Try It** until at least one passes. See [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**.

![Make Dataset under the Results of Touch a Point](/help/make-a-dataset-from-tries/results.png)

The dataset opens over the canvas with the Case's passed tries in it. It takes its name and task from the Case's name and brief.

Or press [[⌘K]] while the Case is open and choose **Make Dataset**.

## From a search

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot. Tries fills the canvas.
3. In the search field at the top of Tries, type what you're after, such as a Case's name or failed last week. See [Search tries](/help/search-tries).
4. Press [[⌘K]] and choose **Make Dataset**.

The dataset keeps your search and its matching samples. A segment match includes that segment's exact frame range. A whole-try match includes the entire recording.

If the scene has the Case those tries came from, the dataset takes that Case's name. Otherwise, it takes the name of your search.

To gather only selected tries, hold [[⌘]] or [[⇧]] as you select them. Right-click one and choose **Make Dataset**. Within a search, those tries contribute only their matching frame ranges.

## The dataset

Above its tries, the dataset shows their total running time. After saving a version, use **Dataset version** to choose **Working Dataset** or a saved version. If it also holds images, it shows their image and class counts and an **Images** section. Datasets saved before class counts were added show only the image count.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

- **Export Dataset** saves a LeRobot zip for tries, with COCO and YOLO folders for any images. See [Export a LeRobot dataset](/help/export-a-lerobot-dataset).
- **Publish to Hugging Face** puts the dataset on the Hub. See [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- **Train from Tries** appears once five of its tries have passed. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).

**Note:** Publish to Hugging Face and Train from Tries are available in the desktop app.

Failed tries stay in the dataset, while export, publishing and training leave them out. A try without a verdict, such as an [imported try](/help/import-robot-data-as-tries), counts as a demonstration. To exclude one, mark it failed in [Label a try](/help/label-a-try).

Any quality flag excludes its selected samples from export, publishing and training. The same actions leave out the tries listed under [Tries that export leaves out](#tries-that-export-leaves-out).

Each try keeps its segments and tags, and export writes the segments as subtasks. To step through one try, see [Open a try from any scene](/help/open-a-try-from-any-scene).

The Library lists each dataset under **Datasets** with its number of tries, images or both, and the class count when saved with the images. Click one to open it.

![Two datasets named Touch a Point under Datasets in the Library](/help/make-a-dataset-from-tries/library.png)

To delete a dataset, right-click it in the Library, choose **Delete**, then click **Delete** to confirm. You keep its tries.

To render an image dataset from a Case without recording tries, see [Make training images from a Case](/help/make-training-images).

## Update and Add to Dataset

Choose **Working Dataset** to edit the current collection. A dataset made from a search has an **Update** button. Click it to replace the collection with the search's current matching samples. Saved versions keep their original samples.

![A dataset made from a search, with Update beside Export Dataset](/help/make-a-dataset-from-tries/searched.png)

To add tries to another dataset, right-click a try, choose **Add to Dataset** and pick the dataset. A toast shows the count, for example "Added 2 tries to Touch a Point".

![The Add to Dataset submenu on a try, listing Touch a Point](/help/make-a-dataset-from-tries/add.png)

## Versions

Export, publishing and training save the working dataset as a version. Each version keeps its selected frames, recordings, labels, tags, quality flags, images, image annotations and split assignments.

Changing an instruction, label boundary, tag, quality flag or recording creates a new version. Changing the robot, task, selected samples or image references also creates a version. Unchanged content keeps its version.

![Pick and place with Working Dataset selected in Dataset version](/help/make-a-dataset-from-tries/working-version.png)

To export an earlier version:

1. In **Dataset version** above the tries, choose **Version 1** or another saved version.
2. Click **Export Dataset**.

![Pick and place with Version 1 selected above its saved try](/help/make-a-dataset-from-tries/saved-version.png)

The export uses that version's saved samples and labels. Repeating an export of that version returns the same saved zip bytes. Publishing Version 2 tags the Hub dataset `dataset-v2`.

Choose **Working Dataset** to return to the current collection. Editing its original tries leaves saved versions unchanged.

Samples from the same source run or recording stay in one training, validation or test group. Generated variations and identical content stay together too. Imported split assignments remain attached to their samples.

Versions saved before frozen samples were supported can’t restore historical labels. Choose **Working Dataset** and export again to save current samples. Missing saved recordings or images stop export and training with an error.

## Tries that export leaves out

Saving a new version leaves out tries recorded on a different robot model. Those tries move to the end of the working dataset. Exporting a saved version uses its saved robot and scene. Training requires the current robot to match that version.

- A try from this Case recorded before the robot last changed shows under "These tries are from an earlier design. Try It again to record new ones."
- A try on another robot, from another Case or scene, shows under "These tries are from another Case or scene."
