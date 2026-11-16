# Performance documentation placement

## Ownership

Shared performance requirements and navigation stay in [Performance](../guide/performance.md), reached through the root [AGENTS.md](../../AGENTS.md). Implementation facts live in area guides. Detailed evidence lives in stable `performance-<subsystem>.md` notes, reused across refinements. Each guide links to its evidence, and each note links back to its guide and shared requirements.

The migration moves 206 implementation and evidence blocks from the central guide. It preserves their facts across the owning guides and notes, including measurement methods, limits, test names, commands and links. The three general profiling and compiler rules stay central. Existing detailed research notes retain their filenames and links.

The existing documentation check also validates local links and section references in `docs/notes/`. Notes do not join the root guide index, and there is no generated registry. A refinement within an existing subsystem edits its guide and note, without touching the central guide, this report or the root index.

## Conflict replay

Issue [#1229](https://github.com/JamelHammoud/basecase/issues/1229) reports 76 performance-guide conflicts in the week. The available loop conflict records contained 67 pull requests naming that path when this replay ran on 15 November 2026. Those are pull request records, not a recount of the reported conflict events.

The sample takes 16 merged refinements from those records, one per independent subsystem. It spans image comparison, imports, gestures, the kernel, datasets, playback, calibration, engineering, Strength, printing, shells, joints, Sketch, simulation, assembly and sheet manufacturing. Each commit adds one documentation paragraph and a blank line near the central guide’s top. Their original insertion offsets range from lines 6 through 10.

| Pull request | Merged commit | Evidence owner |
| --- | --- | --- |
| [#1227](https://github.com/JamelHammoud/basecase/pull/1227) | `1e893ba51` | [image-comparison](performance-image-comparison.md) |
| [#1225](https://github.com/JamelHammoud/basecase/pull/1225) | `e396c4b76` | [onshape](performance-onshape.md) |
| [#1222](https://github.com/JamelHammoud/basecase/pull/1222) | `a43e3b951` | [gestures](performance-gestures.md) |
| [#1221](https://github.com/JamelHammoud/basecase/pull/1221) | `54338c760` | [agent-kernel](performance-agent-kernel.md) |
| [#1218](https://github.com/JamelHammoud/basecase/pull/1218) | `c416ae210` | [datasets](performance-datasets.md) |
| [#1216](https://github.com/JamelHammoud/basecase/pull/1216) | `d5b55827f` | [playback](performance-playback.md) |
| [#1208](https://github.com/JamelHammoud/basecase/pull/1208) | `79b48d5e4` | [calibration](performance-calibration.md) |
| [#1199](https://github.com/JamelHammoud/basecase/pull/1199) | `30fec63b3` | [engineering](performance-engineering.md) |
| [#1195](https://github.com/JamelHammoud/basecase/pull/1195) | `58a30fa48` | [strength](performance-strength.md) |
| [#1194](https://github.com/JamelHammoud/basecase/pull/1194) | `fe488d1ef` | [printing](performance-printing.md) |
| [#1190](https://github.com/JamelHammoud/basecase/pull/1190) | `c59283fc4` | [wrap](performance-wrap.md) |
| [#1187](https://github.com/JamelHammoud/basecase/pull/1187) | `4fa8ee151` | [joints](performance-joints.md) |
| [#1181](https://github.com/JamelHammoud/basecase/pull/1181) | `5238bdedc` | [sketch](performance-sketch.md) |
| [#1168](https://github.com/JamelHammoud/basecase/pull/1168) | `896754a35` | [simulation](performance-simulation.md) |
| [#1116](https://github.com/JamelHammoud/basecase/pull/1116) | `6c9f71b63` | [assembly](performance-assembly.md) |
| [#1073](https://github.com/JamelHammoud/basecase/pull/1073) | `495d35790` | [sheet](performance-sheet.md) |

### Method

Extract the actual added documentation paragraph from each listed commit with `git show --format= --unified=0 <commit> -- docs/guide/performance.md`. Exclude the diff header and preserve the added paragraph’s text. Product code and tests are outside this replay.

For the old layout, branch all 16 additions from the same pre-migration document and insert each before its first performance entry. This models concurrent additions at the common entry point. Compare every unordered pair with `git merge-file -p <left> <base> <right>`, giving 120 pairwise merges. This normalizes the historical line offsets to one common base. It does not reconstruct the original branches or their timing.

For the new layout, partition each same paragraph into implementation facts and evidence using the shipped ownership. Branch again from one common base. Insert the implementation below its existing subsystem heading in the area guide and the evidence in its existing subsystem note. Merge every common file in each pair with the same command. Files changed by only one side need no merge. Do not modify shared navigation or add an inventory entry.

The preservation check compares 203 migrated blocks’ whitespace-separated token counts before and after partitioning. It also checks that each complete implementation and evidence fragment occurs in its destination file, ignoring whitespace. All 203 passed. Three blocks needed small prose edits: separating boot and batch timings from implementation clauses, and making the shader measurement’s software-GL context explicit. Review checked that their connection timing, tab cost, buffer reupload behavior, stall observation and shader measurements remain in the guides and notes. The retained central rules and introductory profiling context remain reachable too.

### Results and limits

| Measure | Central layout | Subsystem layout |
| --- | ---: | ---: |
| Sample changes touching the shared central insertion | 16 of 16 | 0 of 16 |
| Conflicting pairs | 120 of 120 | 0 of 120 |
| Pairs sharing a guide file | 120 of 120 | 11 of 120 |

All 11 pairs that still share an area-guide file edit separate subsystem sections and merge cleanly. No sampled change needs a central-guide edit. Existing subsystems also reuse their evidence notes, so they need no root-index or navigation change.

This is a documentation-placement replay, not a measured reduction in production rebases or CI runs. Same-subsystem edits can still conflict. Shared requirement or navigation changes can still conflict. The result does not claim that all 76 reported events would disappear. Runtime behavior, acceptance tests and performance budgets are unchanged.
