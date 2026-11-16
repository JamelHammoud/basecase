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
