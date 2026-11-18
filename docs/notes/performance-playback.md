# Recorded signals and playback performance

Implementation: [Recorded signals and playback](../guide/cases.md#performance-recorded-signals-and-playback). Shared requirements: [Performance](../guide/performance.md).

## Recorded log queries materialize only matching entries

`logs.test.ts` compares complete results across 80 mixed-schema fixtures, combined filters, sparse columns, edits and frozen inputs. With 300 and 600 messages in each of five schema variants and one severity match in ten, node and message reads fall from 3,000 and 6,000 to 300 and 600. These are operation counts without timing assertions or a claim about complete playback time.

## Try search ranks only the requested results

`rankedHits.test.ts` compares stable sorting across 80 seeded corpora and limit boundaries. Its 3,000- and 6,000-hit fixtures take fewer than two comparisons per hit for 20 results and five for 200 results, including final sorting. These are operation bounds without timing assertions or a claim about complete search time. `searchRanking.test.ts` checks every query path through limits, snapshots and edits.

## Recorded message paths parse once per topic

`messageTree.test.ts` checks all column kinds, union changes, backward reads, edited columns and independent results. Across 40 messages, its 300- and 600-column fixtures reduce path parsing from 12,000 and 24,000 calls to 300 and 600. A scratch comparison matched 4,050 complete messages with the previous calculation, including source edits. These are operation counts and output comparisons, without timing assertions or a claim about complete playback or mapping time.

## Recorded signals resolve through indexed topic names

`topicResolution.test.ts` compares the previous scan across overlapping names and checks numeric, exact-label and ragged signals through forward and backward seeks, source preservation and replacement recordings. Its 256- and 512-topic fixtures reduce topic-name reads across 40 playback queries from 20,500 and 40,980 to zero after preparation. Preparation reads each topic name once. These are operation counts, without timing assertions or a claim about complete playback time.

## World-render acceptance excludes live input runtimes

`worldImportRuntime.test.ts` guards the import boundary. The existing `datasets/worldRender.test.ts` keeps captured pixels, mesh fallback, fisheye, collider depth and encoded video-frame checks, with unchanged assertions and deadlines. Linux setup measurements and the import path are recorded in [Captured-world renderer setup](../notes/world-render-setup.md).

## Playing a try through its console costs one seek

Measured on an M-series Mac for a two-minute try (6,001 frames, 26 signals): the scrub's efforts and forces take 169 ms in the sim worker, the probe trace 27 ms and the track 26 ms on the main thread, a seek 0.002 ms, and a seek with six panels repainted 3.5 ms (`playback.perf.test.ts`, run on demand with `vitest.perf.config.ts`, which fails over 16 ms).

## Tries list from manifests only

`npm run perf:tries` (`tools/perf/triesBench.mjs`) writes 5,000 tries through the store and lists them from a fresh store, failing over 200 ms. On an M5 Pro shared with other builds it took 70–90 ms with the cache file (up to 300 ms at a load average over 80), and about 1 s the first time, before the cache file exists; the list is 1.9 MB of JSON and parses in about 6 ms. The bench takes the best of three runs.

## Try search runs in a worker

`src/cases/trySearch/trySearch.perf.test.ts` builds 10,000 tries and fails a text query over 50 ms or More Like This over 200 ms. On an M5 Pro at a load average of 25: text queries took a median of 6.5 ms (p95 17.3 ms), More Like This 3.1 ms, the build 402 ms, and the 8.8 MB snapshot was written in 47 ms and read in 55 ms.

## MIDI playback emits due events directly

The only production consumer of `midiPlayer` is `midiSource`, which previously sliced the due range and immediately iterated it. Playback now invokes that consumer directly. Device input does not use the file player. No playback batch array is created, including frames between notes, empty songs and frames after completion.

`src/midi/midiPlayer.test.ts` compares complete per-frame outputs with the former sliced calculation over 300 and 600 clock reads. Each fixture has 100 alternating note and control events, groups of three equal-time events, forward jumps and backward restarts. The former calculation creates 300 and 600 batch arrays respectively, including empty batches. The new delivery path creates zero batch arrays. These are source-derived allocation counts, not timings or a claim about complete simulation latency. Event objects and named input events retain their existing ownership and allocation.

Boundary coverage includes repeated timestamps, the 1 ns due tolerance, simultaneous event order, original event identity, empty songs, completion and restart. The source integration test retains real input-bus delivery and null drive output. No browser flow or screen changes. No tests are quarantined by this refinement.

## Saved-source comparison preparation

The design reference is [Foxglove comparison mode](https://docs.foxglove.dev/docs/visualization/comparison-mode): distinct sources share elapsed playback and adjustable offsets. This grounds the interaction model, without a superiority claim. Clock synchronization and coordinate registration require independent evidence.

Measured on 17 November 2026, macOS arm64, Apple M5 Pro, Node 26.13.0. A scratch Vite SSR bundle ran production `prepareSource`, `sampleChannel`, `preparePlot` and raw camera preparation in two concurrent native workers. Small inputs had three frames and two topic channels. Capped inputs held 20,121 frames over 600 seconds, 96 position/velocity/control coordinates, 64 body poses and six selected joint channels. Each was 67,043,432 encoded bytes, below the 64 MiB cap. Arrays were generated directly rather than rerunning physics. A separate raw camera input exercised image reduction in each worker.

| Per-source observation | Small pair, worker range | Capped pair, worker range |
| --- | --- | --- |
| Decode and hash preparation | 2.82–2.94 ms | 33.92–34.12 ms |
| 1,000 forward/backward cursor reads, every channel | 1.27–1.58 ms | 10.55–10.68 ms |
| Timestamp property reads per cursor | 17 | 128.382 |
| Distinct decoded typed buffers | 268 bytes | 67,043,196 bytes |
| Prepared plot samples | 5 | 820 |
| One plot preparation | 0.038–0.044 ms | 5.75–5.93 ms |
| Sampled worker heap plus external memory | 7,717,468–7,975,340 bytes | 222,723,724–223,093,268 bytes |
| Raw camera input bytes | 12 | 12,582,912 |
| Raw camera preparation | 0.054–0.057 ms | 2.36–2.95 ms |
| Prepared camera RGBA bytes | 16 | 1,048,576 |

Worker memory includes fixture construction, encoded and decoded arrays, camera inputs and temporary allocations before garbage collection. It is sampled after open and plot/image preparation, not a continuous peak or a GPU measurement. Distinct typed buffers exclude strings and object overhead. Both workers terminate after each pair. The raw camera allocation above is an actual retained typed buffer. The separate camera fixture avoids attributing its input bytes to BCTR decode.

A macOS documentation capture used `openApp` and ordinary Import for `before.mcap` and `after.mcap`. It selected the Library tiles, opened Compare Tries through the palette, inspected independent red/green pixels and numeric/state values, aligned planted events, sought backward, closed comparison and reopened the original identity and file hash. The capture finished in 19.00 seconds. Its images are under `site/public/help/compare-saved-tries/` and `site/public/changelog/compare-two-tries/`. Vite reported a teardown timeout after the test passed because its two servers retained a process handle. No test deadline, retry or skip was changed.

Each source owns at most one retained camera bitmap and one spatial bitmap in its worker, plus their transferred renderer canvases. At maximum dimensions those four surfaces account for 3,145,728 RGBA bytes per source, excluding decoder workspaces and transient replies. For the captured 2 × 1 camera and 512 × 256 spatial panel, renderer counters measured 8 and 524,288 retained RGBA bytes per source. Including the matching worker surfaces gives 1,048,592 bytes per source. These are dimension-based surface accounting, not measured GPU residency. Video uses the existing indexed decoder rather than decoding the complete clip at each seek. Native worker numbers exclude HTTP, IPC and renderer paint cost.

The ten-case native matrix now includes physical rover, calibrated servo arm, quadruped, payload gripper and appliance models, emulated Operate decoding, real MCAP decoding, raw cameras, unequal-rate ROS columns, gaps and duplicate discrete states. Signal and media tests verify isolation, exact hashes, clipping, missing channels and unsupported frames. Worker/session tests cover replacement, deletion, late results and repeated disposal. The focused browser test is active with retry zero for Linux and Windows CI. Those CI results have not been observed locally.

Plots prepare only when signal selection or sampling age changes. Cursor movement uses indexed timestamp lookup and bounded snapshots. Spatial rasterization reuses two indexed geometry results, with one retained raster per source. No scene rebuild or physical frame registration occurs. Current limits are documented in [Cases](../guide/cases.md#comparison-preparation-coverage).
