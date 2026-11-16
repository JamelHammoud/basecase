# Dataset preparation performance

Implementation: [Dataset preparation](../guide/cases.md#performance-dataset-preparation). Shared requirements: [Performance](../guide/performance.md).

## Dataset slot columns assemble together

Multi-slot `datasetJoints` now appends joint references and prefixed names into the final output arrays and records group boundaries from the accumulated length. The previous implementation retained per-slot records, constructed a starts array through copied prefix reductions, and flattened joints and names separately. Searching `src/` found one slot-column constructor. `episodeData` and `buildDataset` share it, covering episode rows and metadata for both LeRobot versions.

On November 16, 2026, a local Node v26.13.0 probe on macOS arm64 with an Apple M5 Pro compared the previous complete helper with the replacement. The fixture had 24 model joints across three robots, every fourth joint passive, and four slots selecting robots 0, 1, 2 and 0. After 10,000 warmup calls per version, nine alternating batches of 10,000 calls gave median batch means of 0.001570 ms before and 0.000949 ms after. Output equality was checked before timing. At four slots the replacement removes four prefix arrays holding six slot references, the four slot records and their containing array, the starts array, and four temporary prefixed-name arrays. Per-slot robot lookup and joint filtering remain.

`episodes.test.ts` compares 80 generated layouts against the previous constructor, with zero through four slots, missing robots, passive joints, repeated names, reversed membership lists and preserved input objects. A separate case checks repeated robot selections, an empty group between populated groups, slot renaming and model reordering between calls. Existing `jointIndices.test.ts` covers recorded state/action alignment, and `lerobot.test.ts` covers two-arm parquet rows and modality ranges.

These are isolated synchronous helper timings, not complete export latency or CI results. Cases currently permit at most four slots, so prefix-copy savings are bounded and small. No timing assertion or quarantine condition was added. Single-slot behavior, column order, metadata and the export flow stay unchanged, with no screen or interaction change.

## Quality flags share frame validity

Gap and idle flag detection previously checked the same timestamp, joint-position row and body-pose row separately for NaNs. The shared label pass now computes one byte per frame and shares it across both consumers. Searching `src/` found these two consumers in `datasets/qualityFlags.ts`, reached through `workspace/tryLabelPass.ts`. No other quality flag frame-validity scan remains. The mask belongs to one call, so later edits cannot reuse stale validity.

On November 16, 2026, a local Node v26.13.0 probe on macOS arm64 with an Apple M5 Pro compared the previous and current complete `qualityFlags` calls. Each fixture had 10,000 frames, 24 joint positions and 32 bodies with seven pose channels. One fixture moved each body 2 mm per frame. The other held every body stationary. Both omitted a model, leaving joint-limit checking out of the measurement. After ten warmup calls per version, seven alternating batches of five calls gave median batch means of 2.993 ms before and 1.246 ms after for moving bodies, and 7.194 ms before and 5.034 ms after for stationary bodies.

For either NaN-free fixture, validity checks fall from 4,980,000 to 2,490,000 scalar NaN tests per call. This is a derived operation count. Pose comparisons for idle detection remain unchanged. The new temporary mask uses 10,000 bytes for these fixtures and is released after each call. Recordings with early NaNs already short-circuit their channel scans, so their savings depend on where the NaNs occur.

The probe checked exact output parity across 80 generated recordings with zero through 553 frames, moving and stationary bodies, NaNs in all three channels and late timestamps. `qualityFrameGaps.test.ts` retains boundary, mixed-gap and edited-recording checks without a timing assertion. `qualityFlags.test.ts` retains real MuJoCo arm replay coverage. No quarantine condition was added.

These are local synchronous flagging measurements, not CI results or full timeline latency. Segmentation, persistence, joint-limit scans, effort flags, thresholds, sorting and the 100-flag cap are unchanged. There is no screen or interaction change.

## Imported joint ranges accumulate extrema directly

`src/datasets/import/units.test.ts` compares merged ranges and unit detection with the previous mapped extrema across 21 generated groups of 80 episodes with 12 columns. It covers NaN, infinities, reversed ranges, signed zero, empty inputs, inclusive thresholds and unchanged inputs. Existing `importedTries.test.ts` retains complete import and replay coverage.

On November 15, 2026, a local Node v26.13.0 microbenchmark on macOS arm64 with an Apple M5 Pro compared the prior range merge and unit detection with the replacement. The fixture had 1,000 episodes and 48 columns, with bounds `-episode-column` and `episode+column`. After 20 warmup calls per version, seven alternating batches of 100 calls gave median batch means of 0.475 ms before and 0.105 ms after. The merge removes 96 temporary arrays containing 96,000 numeric entries per call. Unit detection also removes its filtered list and two coordinate lists. The result array and its 48 range records remain.

These are local helper timings, not CI results or complete import latency. File decoding, per-episode range construction, replay and persistence are unchanged. The tests have no timing assertions and no quarantine conditions.

## Dataset extraction indexes recorded joint columns

`jointIndices.test.ts` compares 120 generated identity selections with ordered searches and complete episode and demonstration outputs across 40 mixed-robot fixtures. It also checks sparse arrays, subsequent edits and independent results. On 300- and 600-column fixtures, source reads fall from 45,150 and 180,300 to 300 and 600. These are operation counts without timing assertions or a claim about complete export or training time. Robot membership filtering and multi-slot group construction are unchanged.

## Training image acceptance budget

- **Training image acceptance budget** (`node tools/perf/trainingImagesBench.mjs`): on demand, 1,000 labelled 640 × 480 frames in under 120 seconds after one warmup capture. The first 500 frames compare every visible block box against independent projected corner bounds within one pixel. The command accepts `--cpu`, `--dist <dir>` and `--no-build`. The 120-second threshold is a contract, not a measured baseline. It includes worker transfers and JPEG encoding but excludes dataset persistence and archive export. Timing never runs in Check. `e2e/trainingImageBounds.e2e.test.ts` checks five seeded placements without a timing assertion. Other camera acceptance tests cover depth within 5 mm, fisheye projection, occlusion and byte-identical seeded captures.

## Dataset snapshots restore each source once

`snapshotImages.test.ts` bounds frame-ID reads to three per image while restoring and exporting 40 images, avoiding repeated full-set searches.

## Joined video bounds accumulate while reading packets

The shared dataset video joiner collects packets and their time bounds in one traversal. It removes two temporary numeric arrays containing twice the packet count and two post-collection traversals. The retained packet list is unchanged. Searching `src/` and `electron/` found no other encoded-packet time-bound calculation using mapped arrays.

On November 16, 2026 UTC, a local Node v26.13.0 probe on macOS arm64 with an Apple M5 Pro compared the previous collector and mapped extrema with the collector that accumulates bounds. Its 100,000 packet records had permuted timestamps at 25 fps and 0.04-second durations. After 20 warmup calls per version, seven alternating batches of 50 calls gave median batch means of 1.959 ms before and 0.244 ms after. Each call removes 200,000 temporary numeric entries. The probe checked exact packet and bound parity for 100 sizes from zero through 99, five single-packet nonfinite or signed-zero cases, and the timing fixture.

These are isolated synchronous collection timings, not complete export or CI measurements. Demuxing, asynchronous iteration, packet retention and muxing costs remain. `src/datasets/lerobotV3.test.ts` retains integration coverage of joined packet timestamps, episode spans, deterministic output, size rollover and decoder changes. No timing assertion or quarantine condition was added. The empty-stream extrema remain positive and negative infinity, matching the previous calculation.

## Dataset statistics accumulate bounds per episode

The shared LeRobot v3 statistics aggregator flattens one episode bound at a time and updates its output columns directly. It removes the retained minimum and maximum matrices and two temporary episode lists per column. The mean and standard-deviation matrices remain, and their arithmetic order is unchanged. Searching `src/` and `electron/` found one cross-episode feature-statistics aggregator. Per-frame statistics already accumulate their bounds directly.

On November 16, 2026 UTC, a local Node v26.13.0 probe on macOS arm64 with an Apple M5 Pro compared the previous aggregator with the replacement. The fixture had 1,000 episodes and 48 columns. Minima were `-episode-column`, maxima were `episode+column`, means were `episode/2+column`, deviations were `column+1`, and counts cycled from 1 through 50. After 20 warmup calls per version, seven alternating batches of 30 calls gave median batch means of 2.787 ms before and 2.646 ms after. The probe checked exact output equality. Each call removes 96 temporary column arrays containing 96,000 numeric entries. Bound flattening still allocates, but only the current episode's flattened bound is retained by each reduction.

`src/datasets/lerobotStats.test.ts` compares extrema and pooled moments against raw sample statistics over 40 generated datasets with unequal episode lengths, vector features and nested image features. It also checks nonfinite extrema, signed zero, empty datasets, zero-width features and unchanged inputs. `lerobotV3.test.ts` retains complete dataset metadata and deterministic-byte coverage. No timing assertion or quarantine condition was added.

These are local helper timings, not CI results or complete export latency. Parquet writing, video processing, archive compression and the export flow are unchanged. There is no screen or interaction change.
