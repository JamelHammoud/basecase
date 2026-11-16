# Datasets testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Multiply

The previous five-variation browser test with video export took 56 s in run 43642970706 (#867).

## LiDAR scans

The overlapping corridor and dataset-export test in `e2e/drive.e2e.test.ts` was removed after taking 31 s in run 43715791435 ([#1095](https://github.com/JamelHammoud/basecase/issues/1095)).

## Training from tries

The combined search, export, rejection and acceptance browser walkthrough was narrowed after taking 30.443 s in run 43715791435 ([#1083](https://github.com/JamelHammoud/basecase/issues/1083)).

## Dataset versions

The older-version export walkthrough in `e2e/datasetPublish.e2e.test.ts` was removed after taking 35 s in run 43715791435 (#1089). It exported three times. Coverage of the retained replacement is in the owning guide.

## Try labels

The combined try-label browser test was removed after taking 34 s in run 43642970706 (#868). It repeated segmentation, label edits, tags and exported-subtask checks through a reference recording and dataset export.
