# Panels and Layers performance

Implementation: [Panels and Layers](../guide/layout.md#performance-panels-and-layers). Shared requirements: [Performance](../guide/performance.md).

## Insertable search indices

Parts search previously rebuilt each robot's lowercased name, group and search text and tokenized every object category on every query. It now retains robot text by immutable entry identity in a weak map and prepares the ten fixed object categories once. Entries without other owners can be collected. Replacing an entry refreshes its text, and query-specific scores and tie positions are never cached. The default preset list is also prepared once.

A scratch comparison against the previous implementation returned identical complete result lists for 94 queries using 17 robot entries, including one imported robot, and ten object categories. Queries covered preset names and makers, imported source URLs, object names and examples, exact hardware sizes, empty queries and no matches. The committed `src/components/parts/insertSearch.test.ts` additionally checks one title read across five queries, fresh replacement text and reordered score ties.

On an Apple M5 Pro with macOS arm64 and Node 26.13.0, nine batches of 500 queries each had median times of 17.82 ms before and 15.05 ms after. Each batch repeated `arm`, `robot`, `mug`, `desk` and `servo` 100 times with the same entries. The parity pass warmed both implementations first. Per batch, robot text construction falls from 8,500 to zero after warmup and object tokenization falls from 5,000 to zero. The retained indices initially require 17 robot constructions and ten category tokenizations. These are local pure-search measurements, excluding rendering and React compilation, not browser latency or CI budgets. Scratch sources and results remain untracked in `scratch/`.

The screen, actions and labels are unchanged, so there is no new browser walkthrough or help screenshot. This coverage does not measure index reuse across React renders or garbage collection.

## Layers indexes groups once

`layerRows.scale.test.ts` checks scene order, complete group selection and collapsed/search results on 600 interleaved parts in 200 groups, with a linear budget for group lookups rather than a wall-clock limit.

## Try grouping

`tryGroups` serves the Library robot rows, Tries mode and working or frozen dataset member grids through one shared helper. The previous implementation sorted a copy of all summaries, then copied every growing robot list on each append. The new implementation appends once per summary and sorts each completed list. For 10,000 tries belonging to one robot, this removes 49,995,000 copied prior-member references. Final lists retain the source summary objects.

A scratch Vitest comparison on an Apple M5 Pro, macOS arm64, Node 26.13.0 used 10,000 summaries with deterministic shuffled timestamps. Both implementations ran once before nine measured runs each. Median grouping times were 28.04 ms before and 1.47 ms after for one robot, and 3.28 ms before and 1.04 ms after for 20 interleaved robots. Complete grouped outputs matched the previous implementation for both inputs. These measurements precede the locale-equivalent name correction below. They measure local pure-helper work, excluding browser rendering and CI. The scratch benchmark and raw measurements stay in the session's ignored scratch folder.

Review found an ordering difference for distinct robot names that compare equal under `localeCompare`, such as composed `Café` and decomposed `Cafe\u0301`. With an older composed-name try before a newer decomposed-name try, grouping before sorting reversed the previous group order. Each group now retains the input index of its first newest try. Locale-equivalent groups compare those timestamps and indices to preserve the original globally sorted insertion order. This adds one timestamp comparison per append to an existing group, while retaining the elimination of growing-list copies. The corrected implementation has no separate timing measurement.

`src/workspace/useTriesView.test.ts` checks robot ordering, locale-equivalent names with different and tied newest timestamps, newest-first ordering, stable timestamp ties, summary identity, frozen input ownership, independent result lists and empty input. The screen, labels and actions are unchanged, so this refinement adds no browser walkthrough or help screenshots.
