# Dataset preparation performance

Implementation: [Dataset preparation](../guide/cases.md#performance-dataset-preparation). Shared requirements: [Performance](../guide/performance.md).

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
