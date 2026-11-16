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

## Sensor layer owner positions

`withDataRows` is the shared merge for sensor rows in Layers. Previously each owned layer scanned every scene row and all previously inserted data rows, then spliced into the growing output. It now indexes scene ownership and operand boundaries once and appends layers into buckets before one output pass. The index is operation-local. Owner lookup and assembly work is linear in scene rows and layers, excluding query text matching. No sensor layers means no index construction.

A scratch comparison retained complete output equality across ten combinations of five queries and two collapsed-owner sets. Its 2,000 scene rows included repeated owners, four indentation depths and operand rows. Its 1,000 layers included missing owners and unowned layers. The committed `src/components/layers/dataRows.test.ts` additionally covers group headers, shared insertion boundaries, nested operands, frozen input arrays, search while collapsed and empty scene rows. A 200-part, 1,000-layer case bounds part identity and group reads to at most 600, independent of layer count.

On an Apple M5 Pro with macOS arm64 and Node 26.13.0, eleven alternating batches of ten merges had median per-merge times of 9.71 ms before and 0.16 ms after. The equality comparisons warmed both implementations before timing. These local pure-helper measurements exclude React rendering, browser latency and CI. Sources and raw measurements remain in ignored `scratch/layer-owners.test.ts` and `scratch/layer-owner-results.json`. The measurement used nonempty layer lists, so it does not measure the empty-list fast path.

The screen, actions and text stay unchanged. No browser walkthrough, help article update or screenshot is needed for this internal assembly refinement.

## Choice grid sizing scans labels directly

A whole-app search for `labelWidth`, `choiceMinCell` and `GLYPH_EM` found one shared estimator in `design-system/choiceLayout.ts`. Every ChoiceGrid uses it through `choiceGridTemplate`. There is no second glyph-width implementation to change.

The estimator now iterates strings by code point instead of spreading them into arrays. Grid sizing visits the original React label list once, retaining one maximum instead of filtering strings and mapping widths into two arrays. Unknown astral characters still count as one 1em code point. Empty strings still receive cell padding, while a list without string labels still returns zero. Font calibration, arithmetic order, icons and wrapping remain unchanged.

For a grid with 600 string labels, source-derived temporary-array counts fall from 602 to zero: 600 character arrays, one filtered label list and one width list. Source-list traversals fall from two to one. Glyph lookup counts do not change. These are allocation and traversal counts, without a timing claim about rendering or panel interaction. The existing module-initialization glyph table remains unchanged.

On November 16, 2026, `scratch/choice-parity.test.ts` compared the previous and final implementations across 600 labels, four font sizes, astral and combining characters, an isolated surrogate, empty strings and mixed React labels. All widths, cell minima and complete CSS templates matched exactly. The scratch run passed. Committed `choiceLayout.test.ts` retains calibrated width and panel wrapping coverage and adds Unicode and mixed-label cases. No timeout, retry or quarantine changes apply.

This changes no action, label or visible state. Help instructions and screenshots remain accurate, so no help article or capture changes are needed. Implementation and coverage are in [Design system](../guide/design-system.md#performance-choice-grid-sizing).

## Context menu ordering partitions in one source pass

The whole-app search found one destructive-entry partition and divider cleanup, `design-system/menuOrder.ts`, called by the shared `ContextMenu`. Camera menu tests also invoke it directly. Popover menus render their supplied children and do not run this normalization. No second implementation needs changing.

For a nonempty mixed menu, the previous source creates four arrays: ordinary entries, cleaned ordinary entries, destructive entries and the final concatenation. The new source creates two arrays and appends destructive entries into the ordinary result. Source entry visits fall from two full passes plus an ordinary-entry pass to one full pass. The final destructive-entry append remains. For menus without destructive entries, explicit array allocations fall from three to two. These are source-derived counts, not timings or engine heap measurements. No complete menu-opening latency claim is made.

The committed parity test covers 4,096 combinations and preserves heading order, destructive order and divider positions. Separate cases verify the first divider's identity across intervening destructive entries, source ownership, fresh results after edits and empty inputs. Existing camera menu tests cover caller integration. No timeout, retry, quarantine or browser harness changes apply.

This changes no action, label or visible state. Existing help instructions and menu screenshots remain accurate, so no help article or screenshot changes are needed.

## Parts search patterns

A whole-app search for `wordMatcher`, `parseSizeQuery` and `NAMED_SIZES` found one shared pattern constructor for catalog and robot matching. Named size parsing previously rebuilt up to 76 regular expressions per call, plus another to remove a matched size. An unsized insertable search parses twice. The fixed 76 patterns now live for the module's lifetime and have no global or sticky flags, so repeated tests and replacements do not retain cursor state. Size priority, boundary rules and removal of only the first occurrence stay unchanged. Long word matchers no longer construct a boundary expression they never use. The separate hardware query parser uses substring matching and requires no pattern change.

A scratch parity comparison checked complete parsed outputs for 386 queries against the previous parser. It included all 76 named size entries, each alone, with a length, embedded within letters, paired with 608 and repeated, plus metric, empty and unsized queries. On an Apple M5 Pro with macOS arm64 and Node 26.13.0, eleven alternating batches of ten corpus passes had median per-pass times of 3.315 ms before and 0.661 ms after. Both parsers received three warmup passes. This measures only local query parsing, excluding module initialization, matcher construction, result ranking, rendering and CI. Sources and raw results remain in ignored `scratch/search-patterns.test.ts` and `scratch/search-pattern-results.json`.

`catalogSearch.test.ts` covers named size boundaries, catalog priority, metric priority, first-occurrence removal, repeated queries, short word prefixes and literal punctuation. Existing catalog and insertable tests cover hardware variants, ranking, robot sources and object matching. No timing assertion is added. The controls, labels and actions stay unchanged, so no help article or screenshot changes are needed.
