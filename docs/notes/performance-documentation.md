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

## Testing documentation ownership replay

Issue [#1245](https://github.com/JamelHammoud/basecase/issues/1245) reports 26 conflicts in `docs/guide/running-and-testing.md`. On 15 November 2026, the available conflict records reproduce that count exactly: 26 resolution records naming that path across 18 pull requests. Their timestamps range from 14 November at 17:37 UTC to 15 November at 17:53 UTC. Repeated resolutions of the same pull request count separately, as they do in the loop's digest. This sample is separate from the performance replay above.

### Sample and ownership

The table maps each recorded pull request's testing-guide edits to the resulting documentation owners. The linked notes retain detailed incident evidence. Their owning area guides retain coverage facts. A historical edit may touch both an area record and a shared contract.

| Pull request | Recorded events | Documentation edit and resulting owner |
| --- | ---: | --- |
| [#767](https://github.com/JamelHammoud/basecase/pull/767) | 1 | The shared `perf:booleans` command description remains in [Running and testing](../guide/running-and-testing.md). |
| [#837](https://github.com/JamelHammoud/basecase/pull/837) | 1 | The web IndexedDB running contract and `import.meta.glob` harness caveat remain shared. This pull request closed without merging. |
| [#894](https://github.com/JamelHammoud/basecase/pull/894) | 1 | Camera inference and scene-isolation coverage belongs in [Cameras](../guide/cameras.md#testing-coverage). This pull request closed without merging. Its proposed coverage is not added by this migration. |
| [#941](https://github.com/JamelHammoud/basecase/pull/941) | 1 | [Servo and mixed-servo calibration](testing-robot-runtime.md#servo-calibration) move to Robot runtime. The `__studio.calibrate` harness contract remains shared. Merged commit `0332b274d`. |
| [#943](https://github.com/JamelHammoud/basecase/pull/943) | 4 | [Calibration](testing-robot-runtime.md#servo-calibration) and [zero and direction](testing-robot-runtime.md#servo-zero-and-direction) move to Robot runtime. Merged commit `6468bdf46`. |
| [#945](https://github.com/JamelHammoud/basecase/pull/945) | 2 | [Build Along](testing-build.md#build-along) moves to Build. Merged commit `e07827607`. |
| [#946](https://github.com/JamelHammoud/basecase/pull/946) | 1 | [Skill coaching](testing-skills.md#skill-coaching) moves to Skills. Merged commit `48de8f120`. |
| [#949](https://github.com/JamelHammoud/basecase/pull/949) | 4 | [Gallery training](testing-gallery.md#gallery-training) moves to Cases. Merged commit `e5e928523`. |
| [#953](https://github.com/JamelHammoud/basecase/pull/953) | 1 | [Mark labels](testing-toolbar-and-settings.md#mark-labels) move to Toolbar and Settings. Merged commit `06295262d`. |
| [#956](https://github.com/JamelHammoud/basecase/pull/956) | 1 | [Try labels](testing-datasets.md#try-labels) move to Cases and its dataset evidence. Merged commit `d9db47f2f`. |
| [#957](https://github.com/JamelHammoud/basecase/pull/957) | 1 | [Multiply](testing-datasets.md#multiply) moves to Cases and its dataset evidence. Merged commit `58c7260af`. |
| [#1007](https://github.com/JamelHammoud/basecase/pull/1007) | 1 | Captured-world coverage moves to [Cases](../guide/cases.md#testing-coverage), retaining the existing [world-render measurements](world-render-setup.md). Merged commit `84aa2146d`. |
| [#1076](https://github.com/JamelHammoud/basecase/pull/1076) | 1 | Recorded-video coverage moves to [Cases](../guide/cases.md#testing-coverage), retaining the existing [setup measurements](recorded-video-worker-setup.md). The shared offscreen-worker harness contract stays central. Merged commit `52138ae11`. |
| [#1107](https://github.com/JamelHammoud/basecase/pull/1107) | 1 | [Rendered vision](testing-vision.md#rendered-vision) moves to Cases. Merged commit `72d0d08b3`. |
| [#1108](https://github.com/JamelHammoud/basecase/pull/1108) | 1 | [Build Along and Cable reach](testing-build.md#build-along) move to Build. Merged commit `b29229fbb`. |
| [#1157](https://github.com/JamelHammoud/basecase/pull/1157) | 2 | [Pose animation training](testing-skills.md#pose-animation-training) moves to Skills. Merged commit `08d4ffe8b`. |
| [#1162](https://github.com/JamelHammoud/basecase/pull/1162) | 1 | [Dataset versions](testing-datasets.md#dataset-versions) move to Cases. Live-route and common browser-harness cleanup remain shared. Merged commit `aa054400e`. |
| [#1164](https://github.com/JamelHammoud/basecase/pull/1164) | 1 | [Live cameras](testing-cameras.md#live-cameras), [Case startup and console coverage](testing-cases.md#default-console-coverage) and [captured worlds](testing-worlds.md#captured-worlds) move to their Cameras and Cases owners. Merged commit `a42873277`. |

### Method and limits

Read the loop's `state/conflicts/*.json` records and select each `resolutions` entry whose `files` contains `docs/guide/running-and-testing.md`. Keep the pull request number and count every selected entry, without deduplicating repeated attempts. These records store a timestamp and paths, not conflicted hunks or both original merge inputs.

For the 16 merged pull requests, inspect `git show --format= --unified=0 <merged-commit> -- docs/guide/running-and-testing.md` at the commits listed above. For the two closed pull requests, inspect their final diffs with `gh pr diff 837` and `gh pr diff 894`. Map every changed documentation block to the retained shared contract or migrated area record. Use the migration base `aca46b9e4` to locate the current form of records that later repairs already changed. Do not restore obsolete assertions, quarantine states or either closed feature proposal.

This is an ownership replay of all 26 recorded events, not a reconstruction of historical merges. Thirteen pull requests, accounting for 21 recorded events, have only subsystem coverage or incident edits in their inspected testing-guide diffs. Those edits would no longer require a central-guide change. Five pull requests, accounting for five events, still change shared instructions or harness contracts: #767, #837, #941, #1076 and #1162. Three of those also have subsystem edits that move.

Collisions can remain within an owner. The actual inspected diffs for #941 and #943 both change the Servo calibration record. Those for #945 and #1108 both change the Build Along record. Moving them preserves that overlap in the Robot runtime and Build files. Skills, Cameras and Cases also receive multiple sampled edits, sometimes to different records. Shared-contract edits still share the testing guide. Whether any such overlap produces a textual conflict depends on the original base, edit timing and surrounding changes.

The recorded paths cannot identify which hunk caused each event. Final merged diffs can include revisions made after an earlier conflict, and closed pull requests never became shipped behavior. Therefore the 21 relocated event-bearing edits are not 21 proven avoided conflicts. No pairwise merge count, production rebase reduction, CI saving or observed merge-time improvement is claimed. Runtime paths, tests, assertions and quarantine entries are unchanged by this placement work.
