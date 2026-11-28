# Scene storage and startup performance

Implementation: [Scene storage and startup](../guide/scene-tabs.md#performance-scene-storage-and-startup). Shared requirements: [Performance](../guide/performance.md).

## Close selection without copied tab ranges

On 17 November 2026, the shared `nextActiveAfterClose` selector changed from two sliced ranges and a reversed prefix to direct directional searches. Repository search found one implementation and one production caller, `app/useTabActions.ts`. Single-tab closure and the grouped close commands use that caller. Tabs, controls, shortcuts, selection order and help steps are unchanged.

For eight tabs, closing the active fourth tab while both neighbors survive previously allocated two arrays containing seven tab references. It reversed three references and queried both neighboring candidates even though the right candidate already won. The direct search allocates no range arrays and checks only the right neighbor. A surviving active tab still returns before any neighbor search. Closing every tab still selects the caller's replacement blank tab.

These are source-level operation counts, not timings or a claim of perceptible latency reduction. The tab limit is eight, so the removed work is small. `app/tabModel.test.ts` checks 2,048 combinations of closing subsets and active positions against the survivor-order contract, alongside the existing close, replacement, naming, reorder, shortcut and restore checks. No production profile or browser timing was taken. CI owns browser execution.

The three help articles covering `tabModel.ts` were checked against this change. [Open, rename and close scene tabs](../../site/content/help/open-rename-and-close-tabs.md) retains the same close, Undo, reopen, naming and keyboard actions. [Put two robots in one Case](../../site/content/help/put-two-robots-in-one-case.md) uses the unchanged `sceneRobots` discovery path, and closing a robot tab still removes that robot from discovery. [Scene file doesn't open](../../site/content/help/troubleshoot-scene-files.md) retains the same import errors and eight-tab limit. Their steps, labels and depicted states remain accurate, so the articles and screenshots need no edits. The path-based preflight reminders still appear because those articles are unchanged.

## Dated lists prepare timestamps once

`dateGroups.test.ts` checks exact recent cutoffs, month and year labels, timezone offsets, calendar transitions, stable ties, source preservation and unreadable timestamps. Its 300- and 600-item fixtures require exactly 300 and 600 parses and one calendar preparation each. These are operation counts, without timing assertions or a claim about complete list rendering time.

### Month labels within dated lists

A whole-app search found Scenes and Chat History as the two consumers of `groupByDate`, with no separate date-heading formatter. Both now reuse month labels through a call-local map keyed by local year and month. The map is discarded after grouping, so later calls still read the current calendar. The standalone `dateGroupLabel` retains the same calculation.

The 300- and 600-entry fixtures distribute older entries across November 2026, October 2026 and October 2025. Instrumenting the Intl formatter accessor counts three format calls in either fixture, down from one per entry. Expected group labels and item counts are asserted. These are deterministic operation counts rather than wall-clock measurements. Timestamp parsing, sorting and per-item Date construction remain unchanged. No complete list-rendering speedup is claimed.

No actions, labels or screen states change, so help instructions and screenshots remain accurate. No browser walkthrough or quarantine changes apply.

## Insertion ranges scan scalar values

`workspace/robotPlacement.test.ts` covers 150,000 incoming parts and scene obstacles, plus exact coordinate and dimension reads at 600 and 1,200 parts. Articulated placement now reads each dimension once per part, down from six reads per dimension. These are operation counts, without timing assertions.

## Duplicate naming indexes taken names once

`copyName.scale.test.ts` checks gaps, case sensitivity, duplicate entries and unchanged input, and bounds name reads to twice the input size for 600 and 1,200 existing copies. Those fixtures previously took 180,900 and 721,800 reads.

## Boot never waits on anything it doesn't need to draw

The agent connection used to delay the window 0.7–2 s. Each tab builds its own WebGL context, environment map and shaders, costing about 60–250 ms apiece. Measure boot with real scenes reopened (`open-scenes` in `localStorage`), not an empty one.

## Scene version codec and atomic replacement

Version snapshots reuse canonical SHA-256 blocks for immutable parts and project fields. Ordered descriptors, manifests and scene references identify a version. Desktop branches share the same content directory. Browser branches share Blob records in IndexedDB, with the reference, scene and summary published together. Ordinary autosave and preview updates do not transfer a history graph.

The 1,000-part codec fixture reports initial and incremental capture time, graph bytes and the bytes for two full snapshots. Changing one part adds one part block and one descriptor. The desktop fixture measures the same capture plus storage path, verifies zero additional history bytes for an identical branch and requires exactly three new files for one edit, including its manifest. These are local unit-process observations without timing assertions. They exclude worker transport and viewport work.

The atomic replacement probe interrupts the final scene rename. The old scene remains readable after constructing another library instance. Incomplete siblings do not enter listings. Browser tests reject an aborted transaction without moving its history reference. Both stores retain immutable content after scene deletion, so surviving branches remain readable. There is no garbage collection or power-loss guarantee.

The graph's resource budget is 64 MiB of history JSON, 1,000 versions, 100,000 content blocks and 10,000 parts per descriptor. Manifest keys must be distinct SHA-256 identifiers. Declared block sizes share a 64 MiB budget before reads, and actual sizes and hashes must agree. Desktop reads refuse symbolic links and nonregular files. Browser Blob handles are size-checked before their text is decoded.

The acceptance tests retain the ten design cases across the graph, merge and shared Case suites. The retained browser declarations cover named saving, branching, selective merge, restore and reload. Close and reopen recovery is covered by the fast tab-retirement tests. Cross-platform browser execution remains a CI observation, rather than a local claim.

### Shared-part browser observation, 16 November 2026

On macOS arm64 with Node 26.13.0, a real IndexedDB profile in the Vite development web app saved 1,000 primitive parts. The first named checkpoint took 921 ms from click to durable completion. Removing one part and checkpointing took 953 ms. Shared history content grew from 376,954 bytes in 1,007 Blob records to 516,422 bytes in 1,009 records. The second checkpoint added only the ordered descriptor and manifest. Unchanged part records were reused. Reload retained the 999-part design and both named checkpoints.

The capture also observed main-thread long tasks of 176, 97, 124 and 146 ms across checkpointing, viewport editing and history rendering. This combined development trace does not attribute those tasks to serialization and establishes no production responsiveness threshold. Hashing, graph serialization, history quoting and Blob preparation execute in workers. Scene JSON still joins cached part strings on the renderer, using the existing frame-sliced serializer. A production interaction profile remains a performance gap, without a quarantine or timing assertion.

The retained measurement is `scratch/version-worker-measure.json`, produced by `scratch/version-worker-measure.test.ts`. Documentation capture used `scratch/version-capture.test.ts` and completed named save, close and reopen, restore, branch, selective merge and explicit conflict choice. Both captures drove the app through its public controls. No visual judgment was made from the images.

### Covered help articles checked

Preflight's coverage reminders were read against the connected implementation. [Undo what the agent changed](../../site/content/help/undo-agent-changes.md) now describes durable completed ownership and interrupted-run recovery. [Compare two robots on a Case](../../site/content/help/compare-two-robots-on-a-case.md) now describes discarding stale rows. [Scenes, files and the Library](../../site/content/help/scenes-files-and-the-library.md) names local history and branch-link export exclusions.

The follow-up checked every remaining coverage reminder against the final code. Six more articles now describe the affected behavior:

- `design-a-robot-with-the-agent` names the scene in a background completion toast, matching `useLaneControls.ts`.
- `desktop-app-and-web-studio`, `troubleshoot-app-web-studio-limits` and `open-a-shared-scene` distinguish a portable current design from local saved versions and branch links.
- `open-rename-and-close-tabs` and `reopen-a-saved-scene` describe Duplicate as an independently editable alternative with shared source history for selective merge.

The twelve unchanged articles retain their steps, labels and described screenshot states:

| Article | Checked against the final code |
| --- | --- |
| `agent-limits` | Durable checkpoints add no agent tool, file access, hardware access or extra chat slot. `agentLanes.ts` retains four lanes. |
| `attach-photos-files-and-sketches` | `useAgentSession.ts` only passes version actions to run adoption. Attachment, folder and sketch controls are unchanged. |
| `build-a-case-app-with-the-agent` | Baseline and completion capture wrap existing prompt execution. Case console reload, Undo, Done and keyboard paths are unchanged. |
| `inspect-fleet-problems` | `WorkspaceSheets.tsx` adds a separate history host. Fleet incident controls, acknowledgment and recorded-try opening are unchanged. |
| `open-a-past-chat` | `agentLanes.ts` changes Revert availability, without changing chat History, deletion confirmation, new-chat controls or four-lane behavior. |
| `put-two-robots-in-one-case` | `tabModel.ts` carries history and comparison fingerprints. Robot-slot construction, Hand Off controls, try judgment and dataset columns are unchanged. Duplicate still supplies the separate arm. |
| `steer-or-queue-messages` | `useAgentRun.ts` retains steer injection, queue order, Stop and lost-on-reload queue behavior inside the durable run boundary. |
| `teach-a-robot-a-skill` | `RightTabPanels.tsx` changes only the Agent reply's Revert availability. Teaching controls, contract steps and skill freshness checks are unchanged. |
| `the-basecase-window` | Title-bar plumbing adds Scene History to the existing tab menu. Listed title-bar positions, rail entries, panel controls and command menu still hold. |
| `the-design-agent` | The agent guide adds recovery facts. Existing tool scope, priorities, Checks, ordinary undo, steering and follow-up settings remain accurate. The hub's feature summaries stay in feature articles. |
| `troubleshoot-app-agent-not-connected` | The prompt wrapper adds durable run capture. Download, sign-in, reconnect and retry controls and their described messages are unchanged. |
| `troubleshoot-scene-files` | Portable imports still use `decodeSceneFile`, save under a new id and retain the existing part, world and fixture validation errors. History is excluded from portable files. |

The screenshots in these twelve articles describe unchanged controls and states. No replacement capture is needed. Their mechanical preflight reminders remain because the coverage check has no read acknowledgment field. No unrelated page was edited solely to clear a reminder.

### Branch merge browser failure, 16 November 2026

Check for pull request #1565 passed the named-version recovery browser test in 33,359 ms. The branch merge story failed in 85,236 ms including one configured retry. At line 113, the merge had already reduced the target to one part and both tabs remained open. The final click on the source tab waited 30,000 ms because the still-open Scene History overlay intercepted pointer events. The aggregate Check failed solely because this changed-browser job failed.

The slow branch story was deleted rather than extending its waits or retaining its retry-dependent execution. `versionOperations.test.ts` checks a shared branch base, selected incoming edits, both retained histories and restoration of the unchanged source snapshot. `versionMerge.test.ts` checks independent edits, dependency closure, explicit conflicts and unchanged source and target inputs. `sceneBranches.test.ts` covers linked branch creation and source identity. The named-version browser recovery test remains. Review replaces that lost coverage with two focused declarations in `e2e/sceneVersionMerge.e2e.test.ts`. They seed immutable linked records, then exercise branching from the tab menu or selecting and merging an edit. The merge check closes Scene History before switching to the source, preserving the source-retention assertion without the blocked click. Browser execution remains with CI. No quarantine, timeout or retry setting changed.

### Coverage reminder follow-up

All twelve articles in the table above were read again against the final feature diff. `useAgentSession.ts` adds only the version service passed to adopted runs, retaining attachment handling and the 1,568-pixel upload limit. `agentLanes.ts` retains `MAX_LANES = 4` and changes only the ownership source for Revert availability. `useAgentRun.ts` wraps prompt execution with baseline and completion storage, retaining `runOnce` error replies, steering, queue consumption and retry controls. The Case code-edit undo path is unchanged.

`WorkspaceSheets.tsx` retains `FleetIncidentsHost` and adds a separate `SceneHistoryHost`. `RightTabPanels.tsx` changes Revert availability inside the Agent conversation, leaving teaching controls and skill freshness unchanged. `TitleBarTabs.tsx` passes the new history action without changing the title-bar positions or existing controls. `tabModel.ts` adds history and fingerprint fields without changing `sceneRobots` or the eight-tab limit. `useSceneLibrary.ts` changes duplication, while portable import still uses `decodeSceneFile` and a fresh scene id. A duplicate has a fresh id, so Case console values remain separate under `caseStoreKey`.

The agent guide's checkpoint section changes recovery, already covered by the updated undo article linked from the design-agent hub. The twelve articles make no claim that checkpoints remove. All 14 distinct image references across these twelve articles exist under `site/public/`, including the Case console hub images. Their described screenshot states use the unchanged controls above. The locator-correction revision reread each article against these same code changes and retained every step, label, screenshot reference and publication date. No article text, screenshot or publication date needs replacement. Preflight still emits the same twelve read reminders because it checks changed paths rather than recording this assessment.


### Version review corrections

`useSceneVersions.test.ts` drives checkpoint capture and agent baseline storage through the workspace hook and real graph codec. A failed write leaves the last durable graph unchanged, and a deleted scene cannot publish a checkpoint. Further cases check a queued lane baseline after a restore and refusal after a scene reset. Revert refusals reach the conversation’s error toast. Scene writes reserve their queue position before serialization. The history sheet has its own error boundary.

`versionMerge.test.ts` covers attached joints of newly required assembly members, unchanged existing parents and history changes that invalidate a captured comparison. `versionOperations.test.ts` supplies an incoming external image reference and checks that both the published working design and immutable merged checkpoint use the sanitized scene. The source input remains unchanged. A named checkpoint created after comparison invalidates the merge, retaining its newer graph.

The focused browser declarations replace the removed branch merge story. Their runtime has not been measured locally, and no timeout, poll limit, retry or quarantine setting changed.

The named recovery declaration passed in 33,359 ms in the earlier CI observation. It is split into a save, edit, close and reopen check and a restore and reload check with a prebuilt saved graph. The original persistence and restoration assertions remain across those declarations. No local browser duration is claimed for the split.


### Scoped history dismissal correction

The next changed-browser CI run passed named-version close and reopen in 18,411 ms, restore and reload in 9,413 ms, and branch-menu creation in 11,334 ms. The selected-merge declaration reached its one-part target and retained the bracket at x = 20. It then failed at line 58 because the unscoped Close locator matched both a workspace panel and the Scene history dialog. Its 15,249 ms report includes one configured retry. The aggregate Check failed because this browser job failed, with all three required jobs and copy successful.

The dismissal now resolves Close inside the named Scene history dialog. The source-retention assertions and all merge assertions remain intact. This is a deterministic locator correction, with no timeout, retry, quarantine or assertion change. Browser execution remains with CI.


### Review recovery and dependency corrections

A closed tab previously retained its history before the asynchronous completion checkpoint published. Reopening that snapshot could republish the older graph and lose the completed run. Closed records now retain their flush promise, and Undo Close, Reopen Closed Scene and saved-scene opening await it. The closing tab still disappears immediately. `app/tabRetirement.test.ts` uses the real version codec to check the final edited design, retained baseline, completed ownership and failed-flush recovery.

Completed ownership now uses each run's baseline version as its key instead of replacing the lane's previous record. `versionRunRecovery.test.ts` checks two chats sharing one lane, a no-op follow-up and consuming the latest revert while older ownership remains in history. Empty latest records prevent older changes from being offered under the current reply. The worker also rejects restore and merge during an active baseline, covering the interval before controls receive their updated disabled state.

`versionMerge.test.ts` selects a mirrored part without a connecting joint and checks that dependency closure includes its source. Existing guide statements that Revert Changes disappears on reload and relies only on transient lane edits now describe durable ownership. These corrections add no command or walkthrough step. The existing help steps and screenshots remain accurate. No browser runtime, production profile or timing improvement is claimed.

`useAgentRun.test.ts` refuses baseline storage and checks that no prompt is sent, the reply carries the failure for Retry, and lane cleanup still completes. The existing error and Retry copy are reused.

Duplicating a closed scene marks the source checkpoint as an autosave and requires a saved result before creating its branch. `app/sceneBranches.test.ts` rejects a deleted-source write and checks that no branch is published. This prevents a delayed Duplicate from recreating a scene the user deleted.

The review’s changed-file checks cover its 18 files. The workspace selection passed 345 tests across 44 related files, and the branch selection passed 12 tests across five related files. These selections overlap and are not additive. Formatting, ESLint, docs, TypeScript and all 310 site pages passed. Logs are `scratch/review-check-final.log` and `scratch/review-branch-check.log`. Browser execution remains with CI.


### Named-version browser coverage consolidation

The next changed-browser CI run failed the named-version close and reopen declaration after 90,275 ms, including its configured retry. Both attempts waited 30,000 ms for the named version after Reopen Closed Scene. The same declaration had previously passed in 18,411 ms. The log does not establish whether the reopened workspace was active when Scene History opened, so it does not prove a persistence defect. Restore and reload passed in 11,831 ms, selected merge in 10,054 ms and branch-menu creation in 15,542 ms. The aggregate Check failed only because the changed-browser job failed.

The unstable close and reopen declaration is removed. The retained restore and reload walkthrough now creates its named version through Save Version instead of using a prebuilt graph, removes a part, restores the version and checks both parts and its name after reload. This keeps the save UI and durable recovery assertions in one browser declaration. `app/tabRetirement.test.ts` covers reopening the final graph after a pending flush and retaining an in-memory recovery snapshot when that flush fails. Browser timing and close-command integration remain unmeasured locally. No timeout, retry, quarantine or assertion limit changed. Browser execution remains with CI.

### Checkpoint publication and interleaved edits

Review reproduced a checkpoint preparing an old immutable snapshot while a newer working design was saved. Publishing the checkpoint then wrote the old design over the newer autosave. Checkpoint storage now reads the live design inside the scene-write queue. A stale restore is refused before any target write. Applying a restore commits its complete document state before serialization, including goal and annotations. Scene identity and generation are checked inside the storage queue and again after serialization. The browser recovery declaration retains all assertions and additionally waits for durable restore completion and checks for an error before reloading.

Another recovery case starts a lane at one design, edits a part in another chat, then lets the first lane touch that part. Reverting to the run baseline lost the intervening edit. Completion and tab closure now retain the first-edit originals already recorded by each lane. Originals use shared content hashes, with null for a part absent at its first write. A run returning the design to its baseline still retains ownership when its first-edit originals differ. The run baseline remains unchanged. Completed-record validation verifies each original's content hash and matching part id. Older records without originals retain their baseline recovery path.

`useSceneVersions.test.ts` covers newer working-state retention, stale-restore refusal and complete restored metadata. `versionRunRecovery.test.ts` covers interleaved part editing, replacement and removal after reopening, preserves an unrelated edit and refuses missing original content. No timeout, retry, assertion limit or quarantine changed. No production performance measurement is claimed. Browser execution remains with CI.

## Portable scene read budget

The renderer previously buffered complete gzip output before parsing JSON. A small gzip containing repeated spaces could expand without a bound. Portable reads now stop at 128 MiB of decoded UTF-8. This is a retained-input budget, not a bound on JSON object memory or later geometry work.

On 20 November 2026, repository data contained two shipped `.basecase` examples. `folding-arm.basecase` was 536 compressed bytes and 1,490 decoded bytes. `remote-elbow.basecase` was 772 compressed bytes and 2,096 decoded bytes. The largest of the three shipped gallery robot records was the hexapod at 8,193 compact UTF-8 JSON bytes. These are shipped examples, not a maximum scene size. The app has no export-size ceiling. The 128 MiB import budget leaves substantial headroom over those examples and accommodates larger embedded assets. World source imports already permit 64 MiB and scene-history transport permits 64 MiB. Multiple large worlds, numeric geometry expansion and custom meshes can still exceed the new portable budget.

The scene boundary regression injects a 64 KiB reader budget and requires the same size error for oversized gzip and plain data. It separately asserts that the decoder requests the production 128 MiB budget. The original full-size test exceeded its five-second budget under concurrent checks, so the scaled input avoids allocating hundreds of MiB just to test refusal. The shared-reader test observes actual decompression of a 1 MiB gzip and refuses it at 64 KiB before the full output is observed. A separate unending response reads exactly three 32-byte chunks under a 64-byte budget, cancels and unlocks the stream. It never retains the third chunk.

The 21 November 2026 Check for #1984 failed before importing a scene. Its dedicated browser test waited 30 seconds for `[cmdk-input]`, an attribute absent from `CommandPalette.tsx`, then also reported an unhandled filechooser wait rejection. Both attempts failed and the test consumed 78.5 seconds. The aggregate Check failed solely because that browser job failed. The narrow test was removed rather than extending its waits or retaining a second full-size gzip fixture. `sceneFileLimits.test.ts` retains oversized gzip and plain refusal, `readCapped.test.ts` retains early decompression cancellation, and `sceneFile.test.ts` retains successful compressed and plain decoding. Browser refusal feedback and opening a normal scene after refusal remain untested by a dedicated browser case. No quarantine, retry or timeout was added.

Review restores the browser case using the palette's actual `Search commands` accessible label and `ControlOrMeta+k`. The file chooser wait and Enter action share `Promise.all`, so either failure is handled. It retains the production-size compressed input and successful follow-up import, and adds measured text and canvas bounds at the minimum desktop window size. The new recovery sentence exceeded the shared toast's single-line width, which hid the recovery instruction. Error toasts now wrap inside the canvas. Browser execution remains with CI, with no claim of a local browser pass or measured browser duration.

The restored declaration also failed before importing either scene. The next Check waited 30,000 ms for `filechooser` after Enter in the command palette. Both attempts failed, consuming 82,210 ms, followed by the existing ten-second Vite shutdown warning. All other required jobs passed or were correctly skipped, so the aggregate Check only reflects the changed-browser failure. The log does not establish why Enter failed to open the picker and provides no evidence about decoder or toast behavior.

The dedicated browser declaration is removed again rather than maintaining its full-size allocation and failing picker interaction. `sceneFileLimits.test.ts`, `readCapped.test.ts` and `sceneFile.test.ts` retain size refusal, early cancellation and normal decoding. Shared error-toast wrapping remains. Picker integration, rendered recovery-text bounds, canvas containment and opening a scene after a refused import lack dedicated browser coverage. No timeout, retry, skip or weaker assertion is introduced. Browser execution remains with CI.

## Agent-edit production investigation

On 20 November 2026, issue #1959 was traced through the existing production `tools/perf/agentBench.mjs` harness on macOS arm64 on an Apple M5 Pro with 24 GiB RAM, Node 26.13.0 and headless Chrome 157 using Metal at 1440 by 900. The generated fixture contains 225 CAD parts, 296,000 triangles and 14 joints. These are preliminary observations on a shared host with other workers active, not controlled before-and-after results or input-response budgets.

| Baseline phase | Tool completion | Longest task | Total long-task time | Maximum frame gap |
| --- | --- | --- | --- | --- |
| Insert and check one part | 545 ms | 52 ms | 52 ms | 150 ms |
| Edit then Checks | 8,014 ms | 593 ms | 1,184 ms | 533 ms |
| Edit then Checks, separate CPU-profile run | 7,596 ms | 479 ms | 921 ms | 367 ms |

The first command was `node tools/perf/agentBench.mjs --only model_part,edit_then_readiness --profile model_part --json scratch/agent-baseline.json`. The focused attribution command used `--no-build --only edit_then_readiness --profile edit_then_readiness --json scratch/agent-checks-baseline.json`. Logs and copied CPU profiles remain under `scratch/` in the task worktree. These paths are retained local evidence, not committed artifacts.

The focused renderer profile attributed 189 ms of sampled self time to SHA-256 compression called by `skills/artifacts.ts:modelHashes`, through automatic scene-model publication and skill recovery. MJCF generation also ran on the renderer. `sim/calibratedModel.ts` used the preparation worker only for enabled self-contact. Ordinary models called `buildMjcf` directly. `workspace/useSkills.ts` requested the model after scene edits, then calculated its hashes. Recovery calculated those hashes again on the same model.

Ordinary calibrated preparation now uses that existing worker as well. Disabled contact skips decomposition and contact-start simulation. The worker returns the model and its physical hashes. The renderer adopts those hashes in a weak identity cache, checking version, XML, initial pose, robot and joint references before reuse. `sim/scenePreparation.test.ts` covers exact model parity, the worker boundary, stale result refusal, worker termination and timestep hash invalidation. Existing contact tests retain contact-start validation and cancellation.

The broader path remains `useAgentRequests` to `applyAgentOps`, then `useSceneDocument.commitParts`, viewport synchronization and panel derivation. Document history uses immutable part references. Checks derive a fingerprint and gather worker-backed geometry analyses. Scene versions serialize through their worker and publish through the scene write queue. Autosave serializes cached immutable parts after building the active scene's handoff. `aiHandoff.ts` computes all-pairs approximate relationships. The baseline called it synchronously on the renderer. The continuation runs it in the geometry worker. The baseline apply loop lacked a cancellation predicate after awaited preparation and animation pacing. These are source observations, not established causes of the measured longest task.

The initial trace did not establish input-to-visible-response latency, long-task percentiles, worker cost, peak memory, or the ten-workload acceptance matrix. Its original benchmark mode invoked real handlers but bypassed the composer and stubbed saving. It did not establish concurrent editing, Stop, undo and redo, scene switching or durable reopening. No quarantine, retry, timeout, merge gate, render scheduling or loading policy changed.

The first candidate profile used `--dist scratch/agent-candidate-dist` with the same edit-then-Checks phase. It reported 36,350 ms tool completion, a 966 ms longest task, 4,339 ms total long-task time and a 1,617 ms maximum frame gap. This is a failed performance observation, not evidence of improvement. Other workers were building and testing on the same host. The candidate renderer profile no longer attributed its dominant costs to model hashing, but showed substantial guide-item shape-signature work, garbage collection and bridge-fetch time. Attribution of removed work does not compensate for the observed completion-time regression.

An exploratory `scratch/interaction-profile.mjs` also sends ordinary wheel input while real apply and readiness requests run. The baseline observed 31 orbit responses, including 30 before operation completion, with 275 to 2,433 ms automation round trips. The operation took 24,487 ms. These include automation delivery and two animation frames, not isolated input-to-visible latency. Its long-task and frame-gap summaries include boot. It bypasses the composer and stubs saving. These limits prevent using that probe to set a responsiveness budget. No performance acceptance is claimed.

The candidate orbit probe took 76,234 ms and returned 76 responses, including 75 before completion. Its automation round trips ranged from 128 to 12,072 ms. Retained heap snapshots and complete observations are in `scratch/baseline-interaction.json` and `scratch/candidate-interaction.json`. Neither run samples peak memory or worker CPU. These observations also fail to establish a net improvement.

Preflight reminders were read against `arena`, `simulate-self-contact` and `the-design-agent`. Hash inputs and freshness rules, self-contact controls and collision limits, and Agent controls and edit semantics remain unchanged by the model-preparation change. Their existing steps, labels and screenshot states remain applicable, so those pages were left unchanged.

The initial changed-file source run selected 438 related test files and finished in 288.86 seconds. It reported 401 passing files, 36 failing files and one skipped file, with 3,122 passing, 74 failing and 20 skipped tests. The new `scenePreparation.test.ts` suite was not listed among the failures. Failure output includes 5-, 20-, 30- and 60-second test deadlines and a 10-second setup deadline. No deadline or quarantine was changed. These failures have not been isolated against the baseline and are unresolved validation findings. The same command found the unchanged `rehearse-at-a-workbench` changelog's “cannot” copy violation. Source formatting, lint and TypeScript completed before the related run.


### Transaction continuation

The continuation replaces per-operation live document writes with private preparation and one atomic commit. It removes the apply path's animation waits, uses an isolated geometry worker for CAD conversion and rejects cancelled or stale results. Three-way field comparison keeps disjoint concurrent user changes and refuses overlapping fields. The accepted document commit records first-edit originals from the live design. The geometry worker is disposed on cancellation and completion. No additional loading throttle, permanent app render loop or merge gate was added.

Guide item keys now reuse immutable part identities. Handoffs omit geometry and image payloads before worker preparation. The worker returns quoted JSON for autosave, avoiding another renderer pass over the handoff strings. The save queue position is reserved before that preparation. Boolean source hashes invalidate Checks before replacement geometry arrives. Viewport triangle extraction caches actual mesh identities, attribute versions and matrices, returning owned copies to callers.

The generated production workload definitions are in `e2e/agentWorkflowFixtures.ts`. `npm run perf:agent -- --workflow --fixtures scratch/agent-workloads.json --json scratch/workflow-results.json` persists one generated manifest and uses it again for baseline and candidate. `--dist` selects a production bundle. Ten scenes cover primitive insertion, imported mesh replacement, boolean operands, supported Sketch regeneration, repeated catalog servos, joint ranges, articulated Cases, multi-part transactions, named checkpoints and a 1,024-part textured scene. The texture is a generated 1024 by 1024 PNG. All scenes include an articulated arm. No local library scene or attached file is read.

The driver sends from the ordinary composer, delivers deterministic tool requests through the event bridge and uses Layers and Inspector controls. An actual `SceneLibrary` in a temporary directory stores the result, and a new store instance and a page reload reopen it. Workload-specific assertions check the requested edits, including the named version and retained texture. Final records and Chrome traces are retained beside the JSON result. The same driver records browser event timestamps through the next paint after an observed response, long-task and frame-gap distributions, worker round trips and send cost, traced renderer and worker task time and sampled renderer heap plus backing storage. These are browser paint observations and sampled memory, not physical display scanout or a whole-process memory peak.

The first matrix used twelve orbit inputs near the start of each operation. Its baseline and third candidate both reopened the manual edit in all ten scenes. Multi-part transactions took 33,297 ms before and 4,621 ms after. Traced renderer task time fell from 30,864 ms to 1,228 ms. The history workload regressed from 5,245 ms to 6,547 ms, and the candidate texture workload still had a 344 ms maximum long task. Those observations do not establish a complete responsiveness win. The input probe was refined to send wheel input throughout each operation, and the earlier matrix remains exploratory evidence.

The focused continuation selection passed 16 tests across five files in 1.08 seconds. Its TypeScript stage found missing harness declarations and required scene summary fields, which were then added. Earlier related runs also found sheet-edit conflicts from the first transaction implementation. Disjoint-field merge and live-source profile checks corrected those conflicts without weakening either assertion. The source and harness still need validation against their final inputs. No existing repair owner, quarantine or test deadline changed.

The final probe dispatches native wheel events at the canvas every 40 ms from before the first mutation. Selection and Inspector controls run concurrently. This avoids limiting orbit samples to the beginning of a long operation. The probe observes changed projected positions and uses each browser event timestamp through the following paint. Pending wheel dispatches are drained at operation completion. Its continuous observation loop belongs only to on-demand tooling.

The report targets input-to-next-paint p95 of 100 ms and a maximum of 250 ms. Frame-gap targets are 50 ms p95 and 100 ms maximum. A task above 50 ms violates the long-task target. Paired completion and sampled renderer memory targets permit at most a 10% increase. These are explicit investigation targets, not new Check gates. The renderer memory samples exclude worker heaps and whole-process memory. Trace task durations include time a task may be descheduled, so summed worker task time is not physical CPU utilization.

### Continuous-input production comparison

The final bundle was built into `scratch/agent-final-dist`. Baseline used `scratch/agent-baseline-dist`, retained from the original main revision. Both used the same byte-identical `scratch/agent-workloads.json`, Chrome configuration and unheld native wheel probe. Baseline ran before candidate. No local checks overlapped these measurements, though other sessions used the shared host. The baseline was completed in two command selections after correcting a harness assertion that expected six joints instead of the generated arm's eight joints, including its gripper. The saved record already contained every requested range. Rechecking retained records passed the corrected assertions without rerunning successful workloads.

| Workload | Completion before / after, ms | Input p95 before / after, ms | Long task p95 / max after, ms | Frame gap p95 / max after, ms |
| --- | --- | --- | --- | --- |
| primitive-insertion | 14,406 / 9,371 | 1,995 / 1,096 | 434 / 511 | 200 / 717 |
| imported-mesh-replacement | 6,157 / 8,220 | 1,434 / 1,034 | 223 / 230 | 217 / 367 |
| boolean-editing | 4,645 / 6,960 | 762 / 950 | 203 / 219 | 233 / 300 |
| sketch-regeneration | 9,657 / 5,911 | 2,488 / 645 | 213 / 213 | 167 / 233 |
| catalog-assemblies | 25,589 / 7,749 | 9,432 / 863 | 272 / 448 | 183 / 450 |
| joint-authoring | 3,004 / 5,360 | 422 / 649 | 144 / 238 | 167 / 383 |
| articulated-case-edits | 6,331 / 21,013 | 446 / 1,026 | 225 / 328 | 167 / 517 |
| multi-part-transactions | 23,608 / 9,334 | 711 / 1,586 | 253 / 597 | 250 / 700 |
| history-checkpoints | 3,798 / 7,598 | 410 / 760 | 230 / 282 | 200 / 350 |
| textured-scene-save | 14,158 / 11,941 | 5,121 / 3,180 | 620 / 821 | 317 / 1,033 |

| Workload | Renderer task time before / after, ms | Worker task time before / after, ms | Sampled renderer heap and backing storage before / after, MiB |
| --- | --- | --- | --- |
| primitive-insertion | 12,367 / 5,601 | 4,041 / 12,977 | 247.2 / 114.7 |
| imported-mesh-replacement | 3,946 / 5,090 | 3,989 / 6,164 | 124.4 / 120.4 |
| boolean-editing | 2,718 / 4,260 | 2,582 / 9,539 | 130.0 / 110.3 |
| sketch-regeneration | 7,824 / 3,583 | 10,343 / 7,599 | 145.6 / 129.7 |
| catalog-assemblies | 22,857 / 4,391 | 20,583 / 15,029 | 212.6 / 197.7 |
| joint-authoring | 1,239 / 3,931 | 3,041 / 5,541 | 119.6 / 141.3 |
| articulated-case-edits | 1,088 / 8,117 | 14,204 / 73,212 | 126.8 / 101.3 |
| multi-part-transactions | 21,289 / 7,947 | 2,914 / 10,019 | 308.2 / 153.6 |
| history-checkpoints | 1,739 / 5,470 | 3,743 / 5,441 | 161.9 / 157.7 |
| textured-scene-save | 9,187 / 6,962 | 20,551 / 17,272 | 406.3 / 271.3 |

All ten saved records passed workload-specific assertions through a new `SceneLibrary` instance and reopened the manual edit after reload. The texture fixture uses an image plane, the texture representation available on this revision. It does not measure future textured-part formats. The retained records also verify all requested inserted ids. Focused unit coverage retains unchanged viewport geometry, rejects stale and stopped transactions, preserves conflicts and checks undo order. The browser declaration adds selection, Inspector editing, orbit, undo, redo, background tab switching during pending geometry, Stop and durable reload. That declaration has not been executed locally. CI owns browser execution.

Summed completion fell from 111,353 ms to 93,457 ms, but five workloads regressed beyond the 10% target: mesh replacement, boolean editing, joints, Cases and history. Every workload violated the input, frame-gap and long-task targets. Joint authoring also exceeded the sampled-memory target. Aggregate improvement is not acceptance of those regressions. Shared-host contention limits attribution, and does not excuse a measured failure.

Full distributions and individual observations are in `scratch/workflow-baseline-final-combined.json` and `scratch/workflow-candidate-final.json`. Baseline raw traces and saved records are beside `scratch/workflow-baseline-final.json` and `scratch/workflow-baseline-final-rest.json`. Candidate artifacts are beside `scratch/workflow-candidate-final.json`. `scratch/workflow-final-comparison.json` records every paired budget violation. Future on-demand runs can pass `--baseline <baseline-json>` with `--workflow` to write the same comparison beside their output. No timing gate was added.

A focused history attribution run retained `scratch/history-checkpoints.cpuprofile` and `scratch/workflow-history-attribution.json`. It completed in 5,279 ms, compared with the paired candidate's 7,598 ms and baseline's 3,798 ms. Sampled self time included 2,758 ms idle, 1,905 ms unassigned program work, 109 ms garbage collection, 94 ms fetch and 51 ms worker posting. These samples do not identify a remaining dominant JavaScript function or prove the cause of the regression. The throughput and input violations remain unresolved.

The continuation's broad changed-file run reported 4,090 passing tests, eight failing tests and 20 skipped tests across 579 files. Failures include a hook setup deadline and deadlines in print, Cases, body fitting, Motor Kit and vision resource tests. They have not been isolated against baseline. The latest focused selection passed 22 tests across 12 files in 938 ms, with formatting, ESLint and TypeScript passing. The unchanged workbench changelog's two contraction violations still fail the site-copy stage. No test deadline, retry, quarantine or repair restoration condition changed. The task remains incomplete and is not ready for publication.

Final focused validation selected 22 tests across 11 files and passed them in 610 ms. TypeScript and documentation checks passed. Its two tooling padding findings were corrected. The site-copy findings remain unchanged. `scratch/check-final-focused.log` retains the complete selection. Copy diff reports zero counted additions, changes or removals. The transaction conflict recovery message is still listed explicitly in the answer's copy inventory.

Preflight's 18 covered-article reminders were read against the implementation, including Agent setup, steering, undo, Case apps, Checks, guide generation, scene storage, export formats, Arena and self-contact. The changes preserve their menu paths, labels, file contents, timing controls and pictured states. Batching related agent mutations into one history entry still matches the articles' description of one undo step per change. The pages and screenshots were left unchanged. The reminders remain mechanical findings, with this assessment retained instead of unrelated page edits.

### Current-main continuation and measurement mode

The runner advanced main to `a465c5ec799f60bbbf6b7209e9cd45c1a08b3a1d`. Four autostash conflicts were resolved while retaining gripper collision preparation and the new guide sections. The focused merged selection passed 13 tests across five files, types, formatting, lint, docs and all 360 site pages. The previous changelog contraction failure is fixed on this revision. Earlier results remain historical observations, not checks or timings of current inputs.

The workflow harness previously booted each scene twice. It now installs the real store and probes before the sole initial navigation. Existing benchmark probes do not override workflow probes regardless of init order. Final readiness replies must contain a verdict before durable completion. Current-main headless matrices are retained in `scratch/workflow-main-current.json` and `scratch/workflow-candidate-current.json`, using byte-identical generated fixtures. They are intermediate observations before the viewport completion refinement.

A two-second empty-page frame control used the same Chrome channel and Metal flags in each mode. Headless Chrome recorded 22 frame gaps, with 100 ms median and 133.4 ms p95. Windowed Chrome recorded 172 gaps, with 9.2 ms median and 17 ms p95. The result is in `scratch/raf-control.json`. This mode difference prevents treating the headless frame budget as ordinary display responsiveness. Existing on-demand workflow tooling accepts `--headed` for windowed production characterization. Budgets and CI correctness checks remain unchanged.

A detailed windowed Case profile completed in 26,549 ms, with 1,398 ms input p95. An unprofiled windowed observation completed in 12,224 ms, with 282 ms input p95. Detailed tracing therefore remains attribution evidence, separate from the paired characterization. The longest profiled idle callback was the existing shader warmup: 701.8 ms elapsed and 20.4 ms thread CPU. Completed model jobs had different part, rig and world identities. These observations do not establish redundant model preparation, so no model sharing was added on that assumption. Chrome task summaries now retain thread CPU from `tdur` beside elapsed task time.

Source tracing and gated tests reproduced whole-scene completion promoting worker-waiting meshes onto the renderer. Async reads now await the actual layer jobs and drain ready meshes in 6 ms chunks. They share the in-flight immutable source. Picks use the drawn scene. Synchronous geometry reads validate only requested ids and do not force geometry preparation. Pending styling keeps valid source geometry readable. A disposed layer clears both queues, refusing late builds. These changes neither pause loading nor add a permanent render loop.

Model preparation also checked cancellation only near final dispatch. It now checks its combined signal between each awaited stage. Barrier tests prove that cancelled mesh, measurement and world stages do not issue downstream work. Replacing the active Case world or its guest robots aborts those preparations too. New viewport barrier tests cover shared reads, source replacement, disposal, styling, requested-id isolation and ordinary picks. Final checks and windowed characterization of these source changes remain pending.

The first windowed paired attempt retained its baseline primitive row, but the candidate stalled during the stream. The older candidate completed the same primitive workload in 8,131 ms, narrowing the regression to the new readiness and cancellation changes. Candidate rows from the stalled run are absent and cannot support acceptance. Diagnostic processes and their browser were stopped after the stall was demonstrated. Node debugger and native sampling attempts did not produce a usable renderer stack. No cause is inferred from those attempts.

The first data-read implementation competed with the existing scheduler by draining builds in its own continuation loop. It has been replaced with layer readiness promises. Existing worker completion and the existing frame scheduler settle those readers, with no second drain loop. Layer disposal rejects waiting readers and refuses later reads or syncs. The earlier boundary timing observations are not measurements of this replacement. `scratch/check-scheduled-readers.log` records 15 passing tests across three files before the final disposal assertions were added.

### Windowed paired canonical scheduler comparison

The current-main baseline and canonical scheduler candidate used the same generated manifest, windowed Chrome, Metal renderer and 1440 × 900 viewport. Each workload ran adjacent arms, alternating their order. No local check overlapped this matrix. Source and fixture identities are in `scratch/canonical-source-ledger.json`. The canonical scheduler changes and cancellation barriers passed 32 related tests across nine files before this measurement.

| Workload | Completion before / after, ms | Input p95 after, ms | Long task max after, ms | Frame gap max after, ms | Renderer / worker CPU after, ms | Sampled renderer memory after, MiB |
| --- | --- | --- | --- | --- | --- | --- |
| primitive-insertion | 8486 / 2494 | 74 | 68 | 67 | 1006 / 3732 | 106.2 |
| imported-mesh-replacement | 1567 / 1540 | 61 | 54 | 50 | 695 / 1451 | 114.6 |
| boolean-editing | 1535 / 1407 | 104 | 0 | 67 | 623 / 1614 | 112.1 |
| sketch-regeneration | 1744 / 1540 | 91 | 58 | 56 | 773 / 1828 | 119.0 |
| catalog-assemblies | 6690 / 3332 | 207 | 375 | 367 | 1192 / 2527 | 200.4 |
| joint-authoring | 1296 / 1507 | 91 | 91 | 93 | 651 / 1546 | 106.6 |
| articulated-case-edits | 4590 / 5666 | 108 | 92 | 92 | 1209 / 18445 | 103.7 |
| multi-part-transactions | 21491 / 2965 | 81 | 84 | 92 | 1647 / 3206 | 147.1 |
| history-checkpoints | 2669 / 2611 | 79 | 54 | 84 | 1159 / 2550 | 145.1 |
| textured-scene-save | 6903 / 6899 | 220 | 212 | 217 | 2399 / 9589 | 304.4 |

All twenty baseline and candidate rows passed accepted-edit storage, fresh final Checks and reopening assertions, without browser errors. Summed completion fell from 56,971 ms to 29,961 ms. Joint authoring regressed 16% and articulated Cases regressed 23%. Imported replacement and booleans exceeded the sampled-memory target. Every candidate workload retained at least one budget violation. Full percentile distributions, worker round trips and task CPU are in `scratch/workflow-canonical-pair.json` and its `.baseline.json` sibling. The `.budgets.json` sibling lists each violation, and their trace and record directories retain the raw evidence. This matrix precedes the additional worker-backed triangle preparation and does not validate that change.

### Worker preparation and cancellation comparison

The latest measured application bundle is `scratch/current-candidate-v8-dist`, compared with current main at `a465c5ec799f60bbbf6b7209e9cd45c1a08b3a1d`. Both arms used the same generated manifest, Chrome 157.0.8103.79, windowed Metal rendering at 1440 × 900, Apple M5 Pro, 24 GiB memory and Node 26.13.0. Each workload ran adjacent arms, alternating order. No local check overlapped these timings. `scratch/shared-final-source-ledger.json` records the fixture and source hashes. Later analysis-task metadata did not change the application bundle.

| Workload | Completion before / after, ms | Input p95 before / after, ms | Input max after, ms | Long task p95 / max after, ms | Frame gap p95 / max after, ms |
| --- | --- | --- | --- | --- | --- |
| primitive-insertion | 5,974 / 2,702 | 33 / 91 | 100 | 65 / 65 | 17 / 59 |
| imported-mesh-replacement | 910 / 1,543 | 54 / 59 | 76 | 0 / 0 | 13 / 42 |
| boolean-editing | 1,495 / 1,396 | 52 / 90 | 90 | 55 / 55 | 16 / 63 |
| sketch-regeneration | 1,695 / 1,281 | 94 / 89 | 89 | 0 / 0 | 15 / 43 |
| catalog-assemblies | 3,660 / 4,019 | 88 / 159 | 257 | 135 / 135 | 45 / 128 |
| joint-authoring | 1,449 / 1,485 | 106 / 59 | 64 | 0 / 0 | 18 / 41 |
| articulated-case-edits | 5,287 / 4,954 | 130 / 130 | 154 | 106 / 106 | 17 / 103 |
| multi-part-transactions | 19,073 / 4,735 | 41 / 106 | 134 | 92 / 92 | 17 / 100 |
| history-checkpoints | 2,522 / 2,305 | 115 / 85 | 110 | 72 / 72 | 16 / 67 |
| textured-scene-save | 6,825 / 6,519 | 200 / 171 | 380 | 145 / 145 | 17 / 243 |

| Workload | Renderer CPU before / after, ms | Worker CPU before / after, ms | Sampled renderer heap and backing storage before / after, MiB |
| --- | --- | --- | --- |
| primitive-insertion | 5,118 / 944 | 1,316 / 4,667 | 272.7 / 111.2 |
| imported-mesh-replacement | 556 / 666 | 582 / 1,780 | 134.7 / 135.5 |
| boolean-editing | 682 / 587 | 1,541 / 1,282 | 100.3 / 118.9 |
| sketch-regeneration | 743 / 577 | 1,693 / 1,320 | 118.5 / 137.1 |
| catalog-assemblies | 2,666 / 1,146 | 2,003 / 6,840 | 242.5 / 252.7 |
| joint-authoring | 614 / 690 | 1,477 / 2,869 | 122.8 / 120.6 |
| articulated-case-edits | 1,107 / 1,090 | 9,307 / 14,484 | 167.5 / 183.8 |
| multi-part-transactions | 17,497 / 1,829 | 1,780 / 5,352 | 303.0 / 135.0 |
| history-checkpoints | 1,181 / 1,020 | 2,187 / 2,565 | 169.0 / 129.4 |
| textured-scene-save | 2,799 / 2,064 | 9,347 / 13,833 | 343.4 / 310.0 |

All twenty rows saved and reopened the accepted edits, returned fresh final Checks and recorded no browser errors. Both arms showed 20 of 20 runs for the drawer and lid in the ordinary Build tab. The candidate terminated four superseded Case jobs after 186–189 ms pending. These durations are elapsed time before a termination request, not native worker-exit acknowledgment. Completed-worker round trips exclude cancelled jobs, which are retained separately. Trace CPU includes their work during the observation.

Summed completion fell from 48,890 ms to 30,939 ms. Mesh replacement regressed from 910 ms to 1,543 ms. Joint authoring met every reported target. The other nine workloads retained at least one violation. Boolean editing and Sketch exceeded the sampled-memory ratio. Catalog assemblies, Cases, transactions and the textured save exceeded input p95. Case worker CPU also rose from 9,307 ms to 14,484 ms despite its shorter completion. These costs remain acceptance gaps. The memory sample excludes worker heaps, GPU memory and whole-process peaks.

A focused mesh stage comparison retained 2,132 ms baseline and 2,086 ms candidate in `scratch/workflow-mesh-analysis-attribution.json` and its baseline sibling. It did not reproduce the full-matrix completion regression or establish its cause. Both guide jobs in the full candidate row took about 14 ms, ruling out guide startup as the proposed explanation for that row. No worker layout changed on that hypothesis. Full distributions, task CPU, worker metadata, traces and real-store records remain beside `scratch/workflow-shared-final-pair.json`. Its `.budgets.json` sibling lists every violation.

`scratch/workflow-shared-interleavings.json` compares visible-input paint times with actual worker intervals. All ten workloads contain orbit responses during worker activity. Eight contain both selection and Inspector responses during worker activity. The conservative overlap check does not prove selection overlap for boolean editing or either response for Sketch. It does not count work between worker jobs. The CI browser declaration separately covers undo, redo, tab switching and Stop during a held actual geometry reply. It was not run locally, following the local check-only instruction. No timing assertion or new merge gate was added.

### Validation and retained acceptance gaps

The last full current-worktree changed-file check selected 96 files and 609 related test files. Formatting, lint, types, docs and all 360 site pages passed. It reported 4,282 passing tests, ten test deadlines, one suite setup deadline and 20 skipped tests in 177.05 seconds. The test deadlines were in Cases builder, fixture reuse, slots and terrain, gripper lifecycle and four replacement-finger pipeline rows, and vision condition resources. The electrical fixture setup exceeded its existing ten-second deadline. No assertion mismatch was reported. `scratch/check-final-current.log` retains each case and its existing five-second test deadline. The setup failure prevented its fixture tests from running. No skip, retry, deadline or quarantine was changed.

An archive of the same main revision ran changed-file checks on four subsystem inputs. It reported 3,478 passing tests, 73 failures and 50 skipped tests across 470 files. Its kernel exits and native binding assertions differ from the retained worktree’s successful fixture compiles. That run does not isolate the candidate’s deadline failures or establish a shared cause. Evidence is `scratch/check-main-attribution.log`.

After the V8 matrix, a cancellation lifecycle check found that cached idle workers could lose their existing cleanup after a stale slot retired. The pool now retains one existing idle deadline and schedules none for an empty pool. The fake-clock regression is in `caseChecksClient.test.ts`. That final lifecycle correction has not been recharacterized in production. V8 measurements are evidence for their recorded source revision, not a measurement of the final correction.

Preflight reported 24 covered-article reminders. All were read against the implementation, including the six additional Kit, labels, fit-test, printability, time-budget and print-troubleshooting articles. Their actions, labels, thresholds, file contracts and screenshot states remain accurate. Existing Undo language already treats adding several parts as one step. No user action or screenshot state changed. The article hashes and assessment are in `scratch/preflight-current-assessment.json`. Mechanical reminders remain. Copy diff counts zero added, changed or removed strings. The conflict recovery message is listed separately in the answer.

The final lifecycle selection passed 651 related tests across 28 files, with formatting, lint, types and all 360 site pages passing. Its log is `scratch/check-final-case-lifecycle.log`. The full workflow check’s deadline failures remain unresolved. The final source ledger identifies the Case pool lifecycle correction as the application difference from the measured V8 bundle.


### Appearance-readiness merge and current validation

Main advanced to `3699e8e13c013bf24750d963d10f52311a9634bf`. Ten autostash conflicts were resolved, preserving appearance-material reuse, preparation leases, captured-world texture readiness and failure propagation. Viewport readers observe the existing build scheduler instead of promoting worker-pending geometry. Replacing ordered immutable parts rejects old layer readers immediately, even while replacement geometry remains pending. Case world replacement also invalidates whole-scene preparation. Standalone appearance verification explicitly drives ready builds. Disposed layers reject reads and release pending leases.

The broad merged check selected 99 files and 638 related test files. Formatting, lint, docs, types and all 368 site pages passed. It reported 4,312 passing tests, 74 test deadlines, five suite setup deadlines and 73 skipped tests in 481.95 seconds. No assertion mismatch was reported. Deadline failures span Cases, gripper generation, simulation continuation, classroom grading, manufacturing, native printing, mechanism regeneration, vision, skills and other related consumers. `scratch/check-merged-all.log` retains complete names and stacks. That check preceded the final immediate source-cancellation correction. Its result does not validate the final source. Existing deadlines, retries and quarantine conditions were left intact. No cause is assigned from a shared timeout alone.

The merged production baseline is built from an archive of that exact main revision. Candidate application sources are frozen in `scratch/candidate-3699-v2-source`, with hashes in `scratch/merged-source-ledger.json`. A superseded candidate build was stopped after the source-cancellation correction. Historical V8 matrices do not characterize these merged inputs.

The generated textured-save workload now uses 1,001 solids sharing one encoded 1024 × 1024 texture through appearance records and the existing scene asset table. Its durable assertion compares every finish and the complete asset bytes after reopening. The former image-plane fixture remains historical evidence for its recorded revision.

The on-demand driver records actual renderer request intervals with input and paint observations. Its overlap report cannot count a held prompt ending as active mutation work. Chromium process ids also feed the existing 100 ms sampling interval through OS resident-memory readings. Each sample retains process type, cumulative CPU, RSS, sampling duration and missing process readings. The summed RSS includes shared pages multiple times, includes worker storage in its owning renderer process and does not establish dedicated GPU allocations or unsampled peaks. This sampler is available on macOS and Linux. Windows reports it unsupported. Renderer heap samples and trace task CPU remain independently reported.


The first merged pair completed all twenty observations without browser errors. Every arm saved and reopened its accepted edits, including all 1,001 textured solids and their asset bytes. Completion summed to 144,217 ms before and 79,682 ms after. Articulated Cases regressed from 28,825 ms to 32,052 ms. Candidate input p95 ranged from 163 ms to 1,382 ms, leaving responsiveness violations. Both Case rows showed 20 of 20 passing runs.

The first request-interval probe is invalid because intercepted Playwright requests returned zero network start times. Its negative completion timestamps do not prove overlap. The corrected probe timestamps the renderer's actual reply fetch and rejects missing or reversed timestamps. The memory sampler also continued through reopening in that pair. Its peaks describe the broader workflow rather than only timed mutations. Sampling now stops at the durable handoff, before Check-row inspection and reload. Raw observations remain in `scratch/workflow-merged-3699-pair.json`, its baseline sibling and their trace and record directories.

The Case trace also showed old tagged seed batches surviving until after replacement geometry and model preparation. Starting Checks now retires those batches when the requested geometry and Walk identity are absent from the existing model cache. Equivalent cached geometry retains the workers. This changes neither the existing automatic-check interval nor the physics workloads. `scratch/check-early-case-retirement.log` records 168 passing tests across 26 files, with formatting, lint, types and all 368 site pages passing. Formatting and lint also passed for the corrected reply probe. Its runtime characterization remains pending. The new candidate is frozen in `scratch/candidate-3699-v3-source`, with its identities in `scratch/merged-v3-source-ledger.json`.


The warm-worker pair used eight actual Sketch dimension changes, from 166 mm to 208 mm, with 16 subdivisions per box axis. All ten workloads showed orbit, selection and Inspector responses inside actual request intervals. Every baseline and candidate arm saved and reopened accepted edits. Case completion improved from 4,915 ms to 4,224 ms, but worker CPU remained 9,444 ms before and 14,271 ms after. Trace metadata retained ten distinct dedicated-worker threads before and 56 after. Source tracing reproduced preparation spawning child workers inside browser worker realms. That dispatch boundary is corrected without moving work onto the interaction thread.

A pending Checks run also previously returned its captured verdict after a manual edit, before the next automatic check began. The publication guard now checks both the current source fingerprint and run generation. It refuses stale successes and failures for direct callers as well as the panel, without a retry loop or another timer. `scratch/check-readiness-freshness.log` passed eight tests across four files, types, formatting, lint and all 368 site pages. Its SSR hook tests interleave actual source-reference edits with two controlled check completions.

The final source-boundary selection passed 1,526 tests across 172 files, with one skipped test. Its two failed assertions were renderer fixtures that supplied a Worker constructor without a window. They now explicitly represent the renderer and retain their original in-flight abort, edit and worker-termination assertions. No deadline or quarantine changed. The current worker-realm test separately refuses nested worker construction. The full log is `scratch/check-final-source-boundaries.log`.

### Current-main opaque-texture batching comparison

This observation supersedes the earlier matrices for the final v6 source. The baseline is main `3699e8e13c013bf24750d963d10f52311a9634bf`. The candidate source is frozen in `scratch/candidate-3699-v6-source`. `scratch/v6-production-source-ledger.json` records source and driver hashes. Both arms used `scratch/agent-workloads-warm.json`, windowed Chrome 157.0.8103.79, Metal and a 1,440 × 900 viewport on the shared M5 Pro host. Adjacent baseline and candidate order alternated by workload. No local builds or checks overlapped this comparison. Shared external load remains uncontrolled.

All twenty observations saved and reopened accepted edits without browser errors. Every candidate workload recorded orbit, selection and Inspector responses inside actual request intervals. Both articulated Case observations completed twenty of twenty runs. The final durable checkpoint includes a fresh Checks result and the completed agent handoff. Stop, undo/redo and scene switching remain declared in the focused CI browser test. That test was not run locally under the check-only instruction.

Completion summed to 46,409 ms before and 25,636 ms after. This total does not erase the mesh-replacement regression from 844 ms to 1,528 ms. The texture row completed in 6,530 ms and 7,122 ms. Source freshness remains enforced even when concurrent edits require another Checks pass. Faster apply replies do not establish complete interface responsiveness.

All values below are baseline / candidate. Times are milliseconds. The input metric observes the requested document, selection or projection change and the next animation frame. It does not measure display scanout.

| Workload | Completion | Input p95 | Input maximum | Long task p95 / maximum |
| --- | ---: | ---: | ---: | ---: |
| primitive-insertion | 9426 / 2687 | 64.4 / 108.0 | 113.1 / 108.2 | 89/89 / 115/115 |
| imported-mesh-replacement | 844 / 1528 | 57.0 / 69.5 | 57.0 / 79.4 | 0/0 / 56/56 |
| boolean-editing | 1425 / 1360 | 71.4 / 109.8 | 76.0 / 109.8 | 52/52 / 81/81 |
| sketch-regeneration | 2934 / 2272 | 95.8 / 85.5 | 114.7 / 103.5 | 74/74 / 59/59 |
| catalog-assemblies | 3496 / 2868 | 78.5 / 46.3 | 228.3 / 60.7 | 213/213 / 50/50 |
| joint-authoring | 1247 / 1229 | 76.0 / 78.6 | 77.0 / 96.9 | 54/54 / 0/0 |
| articulated-case-edits | 4160 / 2671 | 166.3 / 57.0 | 170.2 / 57.0 | 102/102 / 0/0 |
| multi-part-transactions | 14189 / 1979 | 33.0 / 74.2 | 72.1 / 108.2 | 0/0 / 65/65 |
| history-checkpoints | 2158 / 1920 | 47.6 / 44.2 | 62.8 / 47.3 | 58/58 / 0/0 |
| textured-scene-save | 6530 / 7122 | 330.1 / 179.4 | 346.9 / 333.9 | 185/185 / 135/135 |

| Workload | Frame gap p95 | Frame gap maximum | Worker CPU | Renderer heap and backing MiB | Summed process RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| primitive-insertion | 18.2 / 16.6 | 91.7 / 116.7 | 1928.3 / 4949.4 | 251.3 / 85.9 | 1978.1 / 1728.9 |
| imported-mesh-replacement | 16.7 / 14.4 | 31.9 / 50.0 | 524.5 / 1681.5 | 103.9 / 102.3 | 1559.1 / 1688.7 |
| boolean-editing | 16.7 / 16.4 | 48.9 / 84.4 | 1541.6 / 1644.3 | 101.4 / 82.8 | 1617.9 / 1608.5 |
| sketch-regeneration | 24.0 / 25.1 | 83.3 / 59.5 | 741.0 / 1173.2 | 198.2 / 166.8 | 1776.3 / 1788.9 |
| catalog-assemblies | 18.2 / 16.6 | 208.3 / 50.3 | 1942.4 / 6118.4 | 238.1 / 255.7 | 1958.9 / 2194.8 |
| joint-authoring | 18.8 / 16.6 | 50.4 / 50.1 | 1420.0 / 2469.6 | 84.0 / 87.1 | 1514.0 / 1575.8 |
| articulated-case-edits | 16.7 / 10.2 | 131.7 / 49.9 | 8595.6 / 6726.1 | 95.6 / 85.3 | 2003.6 / 2072.9 |
| multi-part-transactions | 10.2 / 16.7 | 31.8 / 66.6 | 948.8 / 2828.3 | 326.8 / 117.1 | 2016.0 / 1777.1 |
| history-checkpoints | 16.5 / 16.6 | 50.0 / 51.7 | 1668.8 / 1718.7 | 133.5 / 122.8 | 1992.2 / 1970.6 |
| textured-scene-save | 25.0 / 16.4 | 233.0 / 207.5 | 5740.5 / 10145.6 | 294.8 / 241.5 | 2421.8 / 2653.8 |

The on-demand budgets remain input p95 100 ms and maximum 250 ms, frame-gap p95 50 ms and maximum 100 ms, and maximum long task 50 ms. Completion, sampled renderer memory and summed process RSS targets permit at most a 1.1 ratio. These characterize the workload and add no merge gate. Joint authoring, articulated Cases and history meet every reported target. Remaining violations are:

- primitive-insertion: inputP95Ms, frameGapMaxMs, longTaskMaxMs.
- imported-mesh-replacement: longTaskMaxMs, completionRatio.
- boolean-editing: inputP95Ms, longTaskMaxMs.
- sketch-regeneration: longTaskMaxMs.
- catalog-assemblies: sampledProcessMemoryRatio.
- multi-part-transactions: longTaskMaxMs.
- textured-scene-save: inputP95Ms, inputMaxMs, frameGapMaxMs, longTaskMaxMs.

Worker CPU remains higher for several workloads despite shorter completion, particularly catalog assemblies and the textured save. No worker-cost improvement is claimed for those rows. Renderer texture CPU fell from 3,142.2 ms to 2,115.7 ms in this pair, while worker CPU rose from 5,740.5 ms to 10,145.6 ms. The candidate texture input p95 is 179.44 ms and its maximum long task is 135 ms. Batching therefore does not close the remaining workflow acceptance.

Process memory is sampled at the existing 100 ms interval until the durable checkpoint. Summed RSS counts shared pages multiple times and includes worker storage in its renderer process. GPU allocations and peaks between samples are not measured. Cooperative cancellation observations record job age at worker reply, not cancellation-request-to-ack latency. Full distributions, worker messages and process samples are in `scratch/workflow-batched-3699-pair.json` and its `.baseline.json` sibling. Traces and reopened scene records use the same names with `.traces` and `.records` directories. The machine-readable violations are in `scratch/workflow-batched-3699-pair.json.budgets.json`. No repair quarantine or restoration condition changed.

### Current-main validation and remaining work

The broad v6 changed-file check selected 122 changed files and 668 related test files. Formatting, lint, types, docs and 368 site pages passed. Tests reported 4,567 passes, two five-second test deadlines and one existing skipped test in 123.43 seconds. The deadlines were the expanded appearance renderer test and the recorded scan depth-floor test. There were no assertion mismatches. Evidence is `scratch/check-batched-all.log`, with exact inputs in `scratch/batched-check-inputs.json`. The scan deadline remains unattributed. No scan, recording or browser repair quarantine changed.

The expanded renderer test combined its original appearance workflow with four new batching comparisons. Those independent workflows now use two tests in the same existing worker. The original appearance assertions and batching pixel, mapping and resource assertions remain. No deadline, retry or startup process was added. The correction passed both tests in 3.37 seconds through changed-file validation, including formatting, lint, types, docs and 368 site pages. Evidence is `scratch/check-render-workloads-and-evidence.log`. This is focused correction evidence, not a passing rerun of the broad selection. The correction changes only test helpers and does not change the measured production application.

Preflight returned thirty unchanged covered-article reminders. All current articles were assessed against the merged implementation. Fifteen changed or newly covered articles were read again, and fifteen retain their prior matching content hashes. Actions, labels, saved formats, limits and screenshot states remain accurate. The assessment and hashes are in `scratch/preflight-batched-assessment.json`. Copy diff counted zero added, changed or removed strings. The retained conflicting-edit refusal remains listed explicitly in the answer. No new action, help page, changelog entry or screenshot is introduced by this internal refinement.

The original step remains incomplete. Mesh completion, remaining interaction and process-memory targets, elevated worker cost and the unresolved scan validation deadline prevent a complete acceptance claim. Useful edits, the original acceptance scope and exact evidence remain in `scratch/task-handoff.json`.

### Main 371 continuation

Main advanced to `371ecdd3b11ffa92bf2c20a416d62aaba897fa1f`. Seven documentation conflicts were additive sections. Both upstream feature contracts and retained agent-edit contracts were preserved. Baseline and candidate production bundles use archived and frozen sources from that main. Earlier 3699 matrices remain historical evidence for their recorded source.

The first current-main attribution pair measured imported replacement at 1,344 ms before and 1,447 ms after, with worker CPU 1,039 ms and 1,526 ms. The textured row measured 6,872 ms and 6,278 ms, with worker CPU 8,860 ms and 9,197 ms. Candidate input p95 was 48.695 ms and 132.75 ms respectively. All four observations saved and reopened accepted edits. The texture observations included profiling overhead in both arms and are attribution evidence rather than the final matrix. Sources are in `scratch/source-371-ledger.json`, and results in `scratch/workflow-371-attribution.json` and its baseline sibling.

The original profile filename was shared across arms. The final baseline arm replaced the candidate profile, so that file cannot establish candidate function attribution. Older runs also reused this filename. Their recorded attribution totals remain historical observations, but that shared path no longer retains their original raw profile. The current baseline profile is preserved in `scratch/workflow-371-attribution.json.baseline.json.profiles/textured-scene-save.cpuprofile`. The on-demand driver now writes independent per-report profile directories. No timing gate or additional profiling pass is added to CI.

Repeated print requests overlap while earlier Checks are pending. Their round trips include queueing. The existing worker-local cache cannot share results with another pool member. The candidate now shares pending and completed print reports at the analysis entry by versioned geometry and requested local faces. [Printing evidence](performance-printing.md#overlapping-print-analysis-reuses-shape-results) records calculation parity, isolation and cache bounds. The later full-scope comparison below characterizes this change together with the other retained refinements.

The first full current-main changed-file validation passed 4,813 tests across 701 passing files, with one existing skipped file and test. It selected 702 related files from 112 source inputs and completed in 111.53 seconds. Formatting, lint, types, docs and all 379 site pages passed. The previously observed scan deadline did not occur in this selection. This does not isolate its historical cause. Inputs and output are retained in `scratch/check-371-final-inputs.json` and `scratch/check-371-final-all.log`. Subsequent Layers list-position metadata receives its own changed-file check. No deadline, retry, test skip or quarantine changed.

### HTTP scene body attribution

The windowed-Layers candidate's texture profile completed in 4,489 ms with input p95 88.455 ms, maximum input 404.55 ms and a 92 ms maximum long task. Renderer CPU was 1,383.0 ms. Native fetch accounted for 134.54 ms of self samples. Its parent stack passes through `saveSceneJson` and raw `postJson` after scene serialization. The profile and trace are retained under `scratch/workflow-371-window-texture-profile.json.profiles` and `.traces`. These profiled timings are attribution observations, separate from the unprofiled twenty-arm matrix.

The candidate prepares the HTTP body's UTF-8 bytes as a Blob in the existing encoding worker. It sends that immutable body through the same guarded scene route and headers. Native preload and browser-storage paths retain their existing input types. This changes body preparation, without changing JSON content, save ordering or delivery acknowledgment. Focused tests compare exact body bytes, including Unicode and embedded asset content, and refuse a partial request after preparation failure. The full-scope comparison below includes this body preparation path.

The initial body-encoding matrix kept orbit active during the mutation stream and first Checks pass. Its later save and handoff remained in completion, task and frame measurements, but did not receive continuing orbit input. The driver now keeps orbit input through the durable checkpoint in both arms. Wheel events intercepted by modal UI do not count as camera input. No product loading or checking interval changes. Earlier measurements retain their narrower input-sampling scope.

A scratch same-event diagnostic compared origin projection with projections of six authored-part extrema. All eleven observed orbit inputs had matching response times in that primitive workload, with a 34.425 ms maximum. It did not establish origin sensitivity as the cause of earlier high input observations. The projection metric remains unchanged. Results and diagnostic source are `scratch/orbit-point-comparison.json`, `scratch/orbit-point-diagnostic.mjs` and `scratch/orbit-point-workflow.mjs`.

### Full-scope main 371 comparison

The current pair keeps ordinary canvas orbit input active through the durable scene and handoff checkpoint in both arms. It supersedes the earlier input-sampling scope. Sources match `scratch/source-371-full-scope-ledger.json`, with baseline main `371ecdd3b11ffa92bf2c20a416d62aaba897fa1f`. Both bundles use the same generated manifest, Chrome 157.0.8103.79, Metal and 1,440 × 900 window on the shared M5 Pro host. Adjacent arm order alternates. No local checks or builds overlapped measurement. External load was uncontrolled and is not an established cause of any stall.

All twenty observations saved and reopened accepted edits with fresh Checks and no browser errors. Each candidate workload recorded orbit, selection and Inspector responses within real mutation request intervals. Both articulated Case observations completed twenty of twenty runs. Stop, undo/redo, stale cancellation, scene switching and the Layers rename lifecycle are declared in focused CI browser tests. They were not executed locally under the check-only instruction.

Completion sums to 60,372 ms before and 28,119 ms after. Every completion ratio is below 1.1, including joint authoring at 1.068. All candidate input maxima are below 250 ms. These findings do not close the remaining percentile, frame, task and memory violations.

Values are baseline / candidate. Times are milliseconds. Input observes the requested document, selection or projection change and the next frame, not physical display scanout.

| Workload | Completion | Input p95 | Input maximum | Long task p95 / maximum |
| --- | ---: | ---: | ---: | ---: |
| primitive-insertion | 8635 / 2452 | 91.3 / 129.9 | 174.9 / 143.1 | 98/98 / 104/104 |
| imported-mesh-replacement | 2078 / 1617 | 105.7 / 130.0 | 125.2 / 156.2 | 68/68 / 83/83 |
| boolean-editing | 2152 / 1322 | 216.4 / 93.7 | 462.7 / 103.0 | 138/138 / 0/0 |
| sketch-regeneration | 3591 / 2220 | 149.4 / 90.6 | 199.3 / 165.8 | 72/72 / 0/0 |
| catalog-assemblies | 5738 / 4599 | 166.7 / 163.0 | 336.8 / 188.9 | 264/264 / 124/124 |
| joint-authoring | 2119 / 2263 | 127.3 / 123.0 | 166.3 / 142.5 | 141/141 / 117/117 |
| articulated-case-edits | 10355 / 4741 | 237.0 / 128.1 | 427.6 / 198.5 | 214/236 / 129/129 |
| multi-part-transactions | 15086 / 1717 | 32.9 / 34.8 | 61.5 / 52.0 | 0/0 / 0/0 |
| history-checkpoints | 2562 / 2295 | 64.6 / 48.5 | 66.9 / 56.7 | 96/96 / 51/51 |
| textured-scene-save | 8056 / 4893 | 422.8 / 88.8 | 751.8 / 146.7 | 238/238 / 103/103 |

| Workload | Frame gap p95 / maximum | Worker CPU | Renderer heap and backing MiB | Summed process RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| primitive-insertion | 20.2/129.3 / 17.7/124.9 | 1400.5 / 3861.1 | 261.2 / 73.5 | 1666.0 / 1685.4 |
| imported-mesh-replacement | 35.7/68.3 / 33.7/85.6 | 1564.7 / 1123.6 | 105.5 / 78.8 | 1738.9 / 1567.5 |
| boolean-editing | 47.8/143.7 / 27.0/41.6 | 1478.6 / 865.1 | 97.7 / 75.9 | 1559.9 / 1584.6 |
| sketch-regeneration | 46.1/87.8 / 26.6/83.2 | 817.7 / 1600.6 | 184.7 / 128.0 | 1760.8 / 1765.6 |
| catalog-assemblies | 48.5/262.3 / 59.4/133.3 | 2057.9 / 5464.0 | 228.6 / 199.4 | 1699.1 / 1660.4 |
| joint-authoring | 71.3/140.4 / 53.8/109.7 | 1312.0 / 1861.9 | 91.8 / 74.5 | 1280.8 / 1237.8 |
| articulated-case-edits | 71.4/289.5 / 31.5/150.6 | 10046.8 / 8835.8 | 98.0 / 78.2 | 1374.6 / 2042.6 |
| multi-part-transactions | 10.0/41.6 / 15.2/18.0 | 1087.8 / 2960.5 | 317.0 / 88.0 | 2028.0 / 1695.1 |
| history-checkpoints | 25.5/99.7 / 15.5/74.1 | 2485.9 / 1652.9 | 133.7 / 104.7 | 1961.5 / 1991.7 |
| textured-scene-save | 50.2/475.0 / 24.5/100.0 | 11159.4 / 4383.5 | 301.7 / 174.2 | 1854.5 / 2059.9 |

Budgets stay unchanged: input p95 100 ms and maximum 250 ms, frame gap p95 50 ms and maximum 100 ms, and maximum long task 50 ms. Completion, sampled renderer memory and summed process RSS permit at most a 1.1 ratio. They remain on-demand characterization, with no new merge gate. Remaining violations are:

- primitive-insertion: inputP95Ms, frameGapMaxMs, longTaskMaxMs.
- imported-mesh-replacement: inputP95Ms, longTaskMaxMs.
- catalog-assemblies: inputP95Ms, frameGapP95Ms, frameGapMaxMs, longTaskMaxMs.
- joint-authoring: inputP95Ms, frameGapP95Ms, frameGapMaxMs, longTaskMaxMs.
- articulated-case-edits: inputP95Ms, frameGapMaxMs, longTaskMaxMs, sampledProcessMemoryRatio.
- history-checkpoints: longTaskMaxMs.
- textured-scene-save: longTaskMaxMs, sampledProcessMemoryRatio.

Boolean editing, Sketch regeneration and multi-part transactions meet every reported budget. All renderer heap ratios pass. Articulated Cases and the textured scene exceed the process-memory target at 1.486 and 1.111. Worker CPU remains higher in several rows, so faster completion does not establish lower total resource cost. RSS sums shared pages more than once. The existing 100 ms sampler misses intervening peaks and GPU allocations. Worker CPU comes from traced thread execution rather than renderer tool-reply duration.

The largest primitive, imported-mesh and catalog renderer tasks took 104.25, 83.35 and 124.35 ms wall time, with 12.17, 10.92 and 12.27 ms of thread CPU. The texture task used 100.57 ms CPU in 103.87 ms wall time. These observations distinguish execution from waiting but do not identify a common cause. JSON-body worker dispatches do not overlap those early tasks. Attribution is retained in `scratch/full-scope-task-attribution.json` and the original traces.

A separate windowed texture profile on the same frozen candidate completed in 2,869 ms. Input p95 was 49.925 ms, maximum input 78.775 ms and maximum recorded long task 50 ms. Its largest traced task used 47.867 ms CPU in 50.192 ms wall time, distributed across print-plan derivation, renderer work and garbage collection. It does not reproduce or explain the earlier 104 ms task. This favorable observation cannot replace the paired matrix. Evidence is `scratch/workflow-371-full-scope-texture-headed-profile.json`, its `.profiles` and `.traces` directories, and `scratch/full-scope-texture-headed-attribution.json`. An earlier scratch profile accidentally used headless mode and is excluded from this comparison.

Full distributions, request overlap, worker messages, process samples and reopened records remain in `scratch/workflow-371-full-scope-pair.json`, its `.baseline.json` sibling, `.traces` and `.records` directories. Violations are in the `.budgets.json` report. Original responsiveness and resource acceptance remains incomplete. No timeout, retry, repair quarantine or restoration condition changed.

### Final main 371 validation

The current changed-file selection covered 140 changed paths and selected 706 related test files. It passed 4,842 tests across 705 files, with one existing skipped file and test, in 95.88 seconds. Formatting, types, docs and all 379 site pages passed. The only reported errors were two missing statement-separating blank lines in the performance driver. Those were corrected without changing behavior and receive a focused changed-file check. Evidence and exact checked hashes are `scratch/check-371-current-all.log` and `scratch/check-371-current-inputs.json`. No assertion failure or test deadline occurred in this selection. This does not isolate historical intermittent deadlines.

Copy diff reports zero added, changed or removed counted strings. The existing conflict refusal is still listed explicitly in the answer. Preflight returned 34 covered-article reminders. Current changed articles and the four newly covered Layers articles were read against the implementation. Unchanged article hashes retain their earlier assessments. Actions, labels, limits, saved formats and screenshot states remain accurate, so no help edits or captures are needed. Assessments are in `scratch/preflight-371-current-assessment.json`.

Useful work remains retained without publication. Original acceptance is incomplete because the full-scope matrix still violates interaction, task and process-memory targets. The next implementation must address those measured gaps without postponing correctness, dropping user edits or moving repair restoration conditions.

### Report-worker continuation

The next frozen candidate is `scratch/candidate-371-report-source`, with ledger `scratch/source-371-report-ledger.json`. It moves final report derivation into the existing analysis pool and removes transfer-oriented triangle copies inside worker realms. Every asynchronous print caller shares the new boundary. The exact guide order returned by preparation travels with the compact report request. This avoids invoking a synchronous fallback after overlapping settings requests. Source mesh buffers, texture assets and scene notes do not cross that report boundary.

The twenty-arm production comparison retains the same manifest, windowed Chrome, Metal renderer and full-durable input scope as the previous pair. All observations saved and reopened accepted edits with fresh Checks and no browser errors. Each candidate recorded orbit, selection and Inspector responses within request intervals. Every completion, renderer-heap and summed-process-RSS ratio met its existing target. Articulated Case completion was 5,607 ms before and 2,562 ms after. Its input p95 was 32.8 ms, with no recorded long task. These combined changes and shared-host observations do not isolate the cause of the earlier memory gap.

Remaining budgets failed for Sketch regeneration, catalog assemblies, joint authoring, history checkpoints and the textured save. History's largest renderer task took 156.27 ms wall time and 11.09 ms CPU. Sketch's took 129.89 ms wall time and 4.05 ms CPU. Texture's took 53.21 ms wall time and 12.44 ms CPU. Those are waiting or scheduling leads, without an established common cause. Full distributions, resources, traces and saved records remain under `scratch/workflow-371-report-pair.json`, its baseline sibling and `.budgets.json` report.

The later catalog point-cache refinement is absent from this frozen candidate. The final candidate ledger and comparison follow separately. No performance target, timeout, retry or repair condition changed.

### Final report-reuse comparison on main 371

This comparison characterizes the final application source in `scratch/candidate-371-reuse-source`. `scratch/source-371-reuse-ledger.json` records its hashes. Baseline main remains `371ecdd3b11ffa92bf2c20a416d62aaba897fa1f`. Both arms use the unchanged generated workload manifest, windowed Chrome 157.0.8103.79, Metal and 1,440 × 900 viewport on the shared M5 Pro host. Arm order alternates by workload. No local builds or checks overlapped this final measurement. External host load remained uncontrolled.

All twenty observations saved and reopened accepted edits with fresh Checks and no browser errors. Every candidate recorded orbit, selection and Inspector responses inside actual request intervals. Both articulated Case observations completed twenty of twenty runs. Stop, undo/redo, cancellation and scene-switching correctness remain declared for CI, without local browser execution under the check-only instruction.

Summed completion was 50,250 ms before and 24,489 ms after. Every sampled renderer-memory and summed process-RSS ratio passes its target. These totals do not erase the remaining per-workload targets.

All table values are baseline / candidate. Times are milliseconds. Input observes the requested effect and its next frame, not physical display scanout.

| Workload | Completion | Input p95 | Input maximum | Long task p95 / maximum |
| --- | ---: | ---: | ---: | ---: |
| primitive-insertion | 6903 / 2365 | 45.2 / 93.8 | 117.6 / 136.7 | 52/52 / 63/63 |
| imported-mesh-replacement | 1999 / 1404 | 81.0 / 64.9 | 103.0 / 84.8 | 92/92 / 0/0 |
| boolean-editing | 2403 / 1805 | 122.8 / 128.7 | 223.6 / 143.9 | 115/115 / 99/99 |
| sketch-regeneration | 2632 / 2280 | 47.1 / 69.8 | 57.8 / 92.3 | 0/0 / 66/66 |
| catalog-assemblies | 4038 / 2172 | 139.3 / 53.4 | 246.5 / 65.7 | 221/221 / 54/54 |
| joint-authoring | 1070 / 1180 | 54.2 / 45.6 | 67.3 / 45.9 | 0/0 / 0/0 |
| articulated-case-edits | 4896 / 4565 | 97.5 / 87.3 | 107.6 / 103.7 | 91/91 / 75/75 |
| multi-part-transactions | 18973 / 2512 | 55.5 / 80.2 | 140.0 / 109.1 | 59/59 / 0/0 |
| history-checkpoints | 2211 / 2005 | 70.5 / 42.9 | 86.2 / 47.4 | 70/70 / 54/54 |
| textured-scene-save | 5125 / 4201 | 311.7 / 79.0 | 508.1 / 176.5 | 194/194 / 58/58 |

| Workload | Frame gap p95 / maximum | Worker CPU | Renderer heap and backing MiB | Summed process RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| primitive-insertion | 10.3/66.9 / 10.2/74.0 | 1438.5 / 4338.6 | 263.7 / 77.5 | 1875.6 / 1678.3 |
| imported-mesh-replacement | 24.7/92.0 / 15.8/35.7 | 1799.1 / 1295.7 | 104.2 / 80.9 | 1724.4 / 1634.7 |
| boolean-editing | 54.4/146.1 / 38.1/115.4 | 1575.5 / 954.0 | 106.2 / 80.0 | 1474.5 / 1295.8 |
| sketch-regeneration | 16.4/41.7 / 29.0/74.7 | 749.2 / 1394.2 | 173.0 / 123.2 | 1777.2 / 1751.1 |
| catalog-assemblies | 17.4/216.7 / 16.9/40.4 | 2068.9 / 4078.2 | 226.9 / 179.5 | 1847.4 / 1954.3 |
| joint-authoring | 16.7/41.7 / 12.2/53.1 | 1325.4 / 1864.8 | 81.2 / 68.5 | 1507.6 / 1508.2 |
| articulated-case-edits | 24.0/88.8 / 32.3/68.2 | 8471.0 / 11205.9 | 98.4 / 81.3 | 2030.7 / 1919.8 |
| multi-part-transactions | 16.7/75.1 / 20.4/61.0 | 1117.9 / 3945.8 | 298.6 / 91.0 | 1872.0 / 1653.3 |
| history-checkpoints | 20.3/65.4 / 10.3/50.4 | 2045.2 / 1514.6 | 121.5 / 114.1 | 2007.2 / 2014.5 |
| textured-scene-save | 41.5/217.1 / 13.9/50.6 | 5706.4 / 8492.3 | 313.6 / 173.4 | 2644.3 / 2474.1 |

Budgets stay unchanged: input p95 100 ms and maximum 250 ms, frame-gap p95 50 ms and maximum 100 ms, maximum long task 50 ms, and completion and sampled-memory ratios at most 1.1. These remain on-demand characterization without a new merge gate. Remaining violations are:

- primitive-insertion: longTaskMaxMs.
- boolean-editing: inputP95Ms, frameGapMaxMs, longTaskMaxMs.
- sketch-regeneration: longTaskMaxMs.
- catalog-assemblies: longTaskMaxMs.
- joint-authoring: completionRatio.
- articulated-case-edits: longTaskMaxMs.
- history-checkpoints: longTaskMaxMs.
- textured-scene-save: longTaskMaxMs.

Joint completion has a 1.102804 ratio. Boolean input p95 is 128.720 ms. Worker CPU still increases in several rows, despite improved summed completion. No claim of complete responsiveness or universally lower resource cost is made. The original acceptance remains unfinished.

Raw distributions, process samples, worker messages, real request overlap, traces and reopened records remain in `scratch/workflow-371-reuse-pair.json`, its `.baseline.json` sibling, `.traces` and `.records` directories. The `.budgets.json` report lists exact remaining violations. Sampled RSS counts shared pages more than once, misses peaks between the existing 100 ms samples and does not measure GPU allocations. Isolated cause is not established for the remaining low-CPU wall stalls. No repair timeout, retry, quarantine or restoration condition changed.

### Final reuse-source validation

The final changed-file selection covered 143 paths and selected 778 related test files. Formatting, lint, types, docs and all 379 site pages passed. It passed 5,349 tests across 774 files, with one existing skipped file and test. Three tests reached their existing five-second deadlines in 141.36 seconds overall:

- `appearance/render.test.ts`: local color texture, UV orientation, scale and projection rendering.
- `dataLayers/mapWorld.test.ts`: measured recorded-scan depth-floor reconstruction.
- `vision/training/conditionResources.test.ts`: rescoring 1,000 retained predictions.

No assertion mismatch or setup deadline was reported. The cause of these deadlines remains unisolated. No test was deleted, retried automatically, skipped or given more time. Existing recording and browser repair ownership and restoration conditions remain unchanged. Exact checked hashes and output are `scratch/check-371-reuse-inputs.json` and `scratch/check-371-reuse-all.log`. Focused preparation and ownership checks separately passed 38 tests, six snapshot-sharing tests and four final-report reuse tests. Those passing focused checks do not erase the broad validation failures.

Preflight's 39 covered-article reminders have been assessed against the current contracts. The five newly covered bill-of-materials articles remain accurate because `printMaterialOf` only narrows its declared inputs. The other article hashes match their retained current-main assessments. No action, label, saved format, limit or screenshot state changes. No new page or capture is required for this internal refinement. Copy diff counted zero added, changed or removed strings. The conflict refusal remains explicitly listed in the answer.

The original step remains incomplete. Boolean interaction latency, joint completion, remaining long-task targets and required validation still need work. All useful implementation, production records and unresolved evidence remain in `scratch/task-handoff.json`. No later arc step was implemented.

### Main a134 continuation

Main advanced to `a1343c78bd20cb8b65188be40c16d428e5fd039a`. Six autostash conflicts were resolved without dropping either implementation. Additive guide and note sections retain upstream evaluation, preview and quarantine facts. The Case runner retains upstream project inputs, fixed-world controls and awaited checkpoints alongside seeded cancellation guards. No quarantine or restoration condition changed. All earlier production matrices retain their recorded main-371 source and cannot validate this merge.

A current-source cold-load test exposed an identity race in final print-report reuse. Two shape requests begin while their key is absent. The first finishes and prepares a report. A later equivalent response then replaced the shape record, causing another report job. Holding that second response reproduced two jobs where one was expected. The loader now keeps the first valid record for the existing key. Distinct geometry and requested faces retain their existing key distinctions. The test still checks full output parity and owned results.

The acceptance-first check failed that assertion while the checkpoint cancellation test passed. After the correction, all six focused tests passed in 578 ms. Formatting, lint, types and all 383 site pages passed. Evidence is `scratch/check-a134-cold-acceptance.log` and `scratch/check-a134-cold-current.log`. The checkpoint test cancels during the actual awaited callback and verifies engine disposal. New production characterization follows from archived current-main and candidate sources.

### Final source-scoped comparison on main a134

On November 21, 2026, the final source-scoped candidate was compared with archived main `a1343c78bd20cb8b65188be40c16d428e5fd039a`. Both production bundles used Node 26.13.0 and the same generated manifest, windowed Chrome 157.0.8103.79 and Metal on the Apple M5 Pro. Baseline and candidate arms alternate by workload. No own check, build or separate profile overlaps this pair. Each cell lists baseline then candidate. These are one observation per arm and workload, without a repeat-until-pass procedure.

The frozen sources and per-file hashes are recorded in `scratch/source-a134-scoped-ledger.json`. Bundles are `scratch/main-a134-dist` and `scratch/candidate-a134-scoped-dist`. Raw distributions, worker messages, requests, frame observations, process samples, real durable designs and traces remain beside `scratch/workflow-a134-scoped-pair.json`. Earlier main-371 and current-main intermediate candidates remain historical for their own source hashes. They do not validate this final source.

All twenty observations saved and reopened their accepted edits with fresh Checks and no browser errors. All ten candidates recorded orbit, selection and Inspector responses within actual request intervals. Articulated Case observations completed twenty seeds per retained verdict. Completion totals are 44,644 ms before and 18,976 ms after. Faster aggregate completion does not excuse a per-workload regression.

| Workload | Completion ms | Input p95 ms | Input max ms | Long-task p95 ms | Long-task max ms | Frame-gap p95 ms | Frame-gap max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| primitive-insertion | 5611.00 / 1466.00 | 33.67 / 34.75 | 58.55 / 44.94 | 0.00 / 0.00 | 0.00 / 0.00 | 10.01 / 9.67 | 41.67 / 25.28 |
| imported-mesh-replacement | 1219.00 / 873.00 | 52.01 / 33.04 | 64.79 / 33.59 | 0.00 / 0.00 | 0.00 / 0.00 | 10.33 / 9.98 | 25.39 / 16.57 |
| boolean-editing | 1132.00 / 856.00 | 48.16 / 39.12 | 72.26 / 46.43 | 0.00 / 0.00 | 0.00 / 0.00 | 10.31 / 10.25 | 23.43 / 17.09 |
| sketch-regeneration | 2370.00 / 1369.00 | 45.50 / 46.54 | 51.55 / 47.96 | 0.00 / 0.00 | 0.00 / 0.00 | 10.11 / 10.24 | 33.07 / 24.25 |
| catalog-assemblies | 3091.00 / 1849.00 | 64.78 / 48.75 | 185.56 / 65.76 | 167.00 / 0.00 | 167.00 / 0.00 | 10.34 / 16.23 | 158.13 / 33.12 |
| joint-authoring | 855.00 / 988.00 | 45.91 / 34.49 | 47.83 / 37.97 | 0.00 / 0.00 | 0.00 / 0.00 | 16.67 / 9.83 | 32.84 / 24.71 |
| articulated-case-edits | 3007.00 / 2820.00 | 39.72 / 33.63 | 53.30 / 37.05 | 0.00 / 0.00 | 0.00 / 0.00 | 9.97 / 10.18 | 33.69 / 41.75 |
| multi-part-transactions | 17401.00 / 1860.00 | 37.50 / 39.59 | 129.63 / 45.78 | 55.00 / 0.00 | 55.00 / 0.00 | 10.15 / 15.45 | 87.51 / 26.24 |
| history-checkpoints | 2551.00 / 2185.00 | 88.21 / 69.32 | 102.70 / 107.94 | 81.00 / 53.00 | 81.00 / 53.00 | 25.61 / 14.07 | 119.43 / 58.18 |
| textured-scene-save | 7407.00 / 4710.00 | 340.12 / 87.47 | 480.07 / 203.55 | 280.00 / 92.00 | 280.00 / 92.00 | 41.36 / 17.01 | 291.67 / 101.40 |

A zero long-task entry means no task above the observer threshold was recorded. Input latency ends after the requested state effect and the next frame. It does not measure physical display scanout. Worker CPU is traced dedicated-worker task CPU, separate from round-trip queueing and message-send distributions in the raw report.

| Workload | Worker CPU ms | Sampled heap and backing MiB | Sampled summed RSS MiB | Completion ratio | Remaining violations |
| --- | ---: | ---: | ---: | ---: | --- |
| primitive-insertion | 1048.17 / 2908.14 | 274.59 / 74.83 | 1958.39 / 1754.03 | 0.26 | None |
| imported-mesh-replacement | 895.24 / 874.84 | 98.93 / 74.80 | 1669.52 / 1662.63 | 0.72 | None |
| boolean-editing | 1148.86 / 700.41 | 108.77 / 71.39 | 1639.47 / 1582.34 | 0.76 | None |
| sketch-regeneration | 550.52 / 1058.53 | 200.77 / 122.00 | 1784.45 / 1749.80 | 0.58 | None |
| catalog-assemblies | 1738.89 / 3399.29 | 140.79 / 172.98 | 1935.77 / 1872.22 | 0.60 | sampledMemoryRatio |
| joint-authoring | 1021.32 / 1662.08 | 84.88 / 71.61 | 1526.75 / 1528.02 | 1.16 | completionRatio |
| articulated-case-edits | 7365.33 / 9803.96 | 84.97 / 79.45 | 2001.41 / 2013.95 | 0.94 | None |
| multi-part-transactions | 1381.49 / 3043.04 | 278.95 / 80.43 | 1951.03 / 1816.69 | 0.11 | None |
| history-checkpoints | 2261.32 / 1855.01 | 136.64 / 122.60 | 1988.05 / 2034.17 | 0.86 | longTaskMaxMs |
| textured-scene-save | 10853.48 / 5892.43 | 305.46 / 188.00 | 2621.53 / 2000.02 | 0.64 | frameGapMaxMs, longTaskMaxMs |

Targets remain 100 ms input p95 and 250 ms maximum, 50 ms frame-gap p95 and 100 ms maximum, and no main-thread task above 50 ms. Completion, sampled renderer heap and backing storage, and sampled summed process RSS allow at most a 1.1 ratio. The existing on-demand report lists violations without adding a merge gate. Every candidate input-latency target passes. Catalog sampled heap and backing storage reaches a 1.23 ratio. Joint completion reaches a 1.16 ratio. History and textured saves exceed the long-task limit, and the textured frame gap reaches 101.4 ms. The original acceptance scope remains incomplete.

Process sampling runs every 100 ms. Summed RSS counts shared pages repeatedly and excludes GPU allocation and unsampled peaks. Renderer heap and backing storage exclude native worker allocations. These observations are macOS evidence, without Linux or Windows performance claims. Cancellation, undo, redo, scene switching and unchanged geometry retain focused unit coverage and the declared composer browser test for CI. Local e2e execution remains outside this lane.

The joint observation has two readiness requests in both arms. Its regression is not established to have the earlier mesh fixture’s single-versus-double verdict cause. Remaining stalls need attribution before another correction. The final all-file validation and exact input hashes are retained in `scratch/check-a134-final-all.log` and `scratch/check-a134-final-inputs.json`.

### Final validation and remaining work

The all-file changed check selected 803 related files. It reported 5,427 passing tests, 21 failed tests and 30 existing skips. Fourteen files failed. Two hooks missed their existing deadlines, and most failed test cases missed five-second deadlines. The CLI interruption test instead found its report HTML missing. Those failure causes remain unisolated. Formatting, docs, types and all 383 site pages passed. ESLint also found the merged Case runner four nonblank lines above the file limit.

The retained failures cover appearance render workers, recorded scan reconstruction, condition evaluation, person-camera setup, electrical setup, finger lifecycle and simulation, Case reference simulation, body-motion previews, continuation and CLI evaluation. Their exact tests, assertions and errors remain in `scratch/check-a134-final-all.log`. No deadline, retry, quarantine or restoration condition changed. These are unresolved checks, not evidence of an unavailable host.

The existing controller-setup disposal helper was then moved verbatim into the sibling `runCaseLogic.ts` helpers, with its parameter and result expressed through a generic disposable type. This removes the file-limit violation without adding a scheduling boundary. A separate test also retains the late-success shape-identity assertion across independent sources. Focused final validation is in `scratch/check-a134-final-corrections.log`. The full source ledger and all-file input hashes predate this helper move and test addition. Their production timings remain evidence for the recorded pre-extraction source. Recharacterizing the final helper layout remains alongside the measured responsiveness gaps and unresolved validation.

The final correction selection passed format, lint, docs, types and all 383 site pages. It passed 1,576 tests across 177 files, with one existing skip. The paired-rover CLI evaluation still missed its five-second deadline. All seven print-preparation tests passed, including late success from an independent source and owned report reuse. No focused browser test ran locally. This correction check does not erase the other failures from the broader selection. Copy diff reports zero added, changed or removed strings.

## Current-main production comparison on fe8b

Main advanced to `fe8b2ac8b9cb08843e074372761d6341e630407a`. Three additive autostash conflicts were resolved in Build, Canvas and this viewport subsystem’s note. Both sides were retained, including upstream repair evidence and restoration conditions. No quarantine configuration or condition changed. The earlier a134 measurements remain historical for their frozen source.

On November 21, 2026, both current-main and retained-candidate production bundles were rebuilt with pinned Node 26.13.1. The workload manifest is byte-identical across both arms. Its SHA-256, source hashes and bundle paths are in `scratch/source-fe8b-ledger.json`. This includes the final engine-helper extraction and late independent-source test. Windowed Chrome 157.0.8103.79 used Metal on the Apple M5 Pro. No own build, check or separate profile overlapped the pair. Arms alternate by workload. Cells below list baseline then candidate.

All twenty observations saved and reopened accepted edits with fresh Checks and no browser errors. All ten candidates recorded orbit, selection and Inspector effects within actual request intervals. Articulated Case observations completed twenty seeds per retained verdict. Total operation completion fell from 37,689 ms to 16,067 ms. This compares the combined refinement, without isolating any one change’s contribution.

| Workload | Completion ms | Input p95 ms | Input max ms | Long-task p95 ms | Long-task max ms | Frame-gap p95 ms | Frame-gap max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| primitive-insertion | 4780.00 / 1230.00 | 33.54 / 34.74 | 50.85 / 48.86 | 0.00 / 0.00 | 0.00 / 0.00 | 10.05 / 10.19 | 32.44 / 25.46 |
| imported-mesh-replacement | 757.00 / 799.00 | 54.51 / 41.90 | 54.51 / 41.90 | 0.00 / 0.00 | 0.00 / 0.00 | 16.76 / 10.02 | 33.37 / 17.07 |
| boolean-editing | 727.00 / 673.00 | 47.74 / 46.61 | 47.74 / 46.61 | 0.00 / 0.00 | 0.00 / 0.00 | 16.26 / 10.17 | 33.90 / 25.00 |
| sketch-regeneration | 2168.00 / 989.00 | 34.71 / 32.79 | 52.35 / 36.59 | 0.00 / 0.00 | 0.00 / 0.00 | 9.43 / 10.10 | 25.00 / 16.29 |
| catalog-assemblies | 2370.00 / 1331.00 | 53.65 / 39.13 | 128.46 / 50.87 | 127.00 / 0.00 | 127.00 / 0.00 | 10.32 / 9.91 | 125.26 / 41.44 |
| joint-authoring | 742.00 / 776.00 | 49.62 / 33.94 | 49.62 / 39.05 | 0.00 / 0.00 | 0.00 / 0.00 | 16.66 / 10.33 | 32.30 / 24.95 |
| articulated-case-edits | 2683.00 / 2801.00 | 34.95 / 34.42 | 59.85 / 42.44 | 0.00 / 0.00 | 0.00 / 0.00 | 10.32 / 10.08 | 35.30 / 83.85 |
| multi-part-transactions | 15215.00 / 1258.00 | 33.49 / 39.67 | 76.98 / 50.41 | 0.00 / 0.00 | 0.00 / 0.00 | 9.91 / 10.34 | 42.00 / 24.98 |
| history-checkpoints | 2235.00 / 2137.00 | 74.73 / 37.88 | 80.84 / 42.61 | 71.00 / 0.00 | 71.00 / 0.00 | 25.01 / 11.04 | 75.01 / 41.68 |
| textured-scene-save | 6012.00 / 4073.00 | 263.53 / 42.52 | 431.60 / 168.48 | 200.00 / 0.00 | 200.00 / 0.00 | 33.36 / 10.03 | 250.07 / 33.33 |

| Workload | Worker CPU ms | Sampled heap and backing MiB | Sampled summed RSS MiB | Completion ratio | Violations |
| --- | ---: | ---: | ---: | ---: | --- |
| primitive-insertion | 908.63 / 2420.98 | 290.53 / 75.25 | 1964.98 / 1742.19 | 0.257 | None |
| imported-mesh-replacement | 441.96 / 796.51 | 98.66 / 76.37 | 1565.08 / 1649.12 | 1.055 | None |
| boolean-editing | 536.82 / 564.17 | 111.41 / 71.01 | 1574.00 / 1558.80 | 0.926 | None |
| sketch-regeneration | 458.75 / 735.44 | 172.35 / 121.66 | 1771.61 / 1742.31 | 0.456 | None |
| catalog-assemblies | 1310.96 / 2412.18 | 156.02 / 171.26 | 1918.52 / 1946.19 | 0.562 | None |
| joint-authoring | 925.48 / 1265.53 | 84.81 / 69.58 | 1511.30 / 1542.58 | 1.046 | None |
| articulated-case-edits | 6445.57 / 9442.63 | 100.28 / 78.69 | 1978.53 / 2049.23 | 1.044 | None |
| multi-part-transactions | 1086.66 / 2184.44 | 311.24 / 92.87 | 2035.94 / 1781.89 | 0.083 | None |
| history-checkpoints | 2058.60 / 1684.57 | 124.42 / 115.10 | 1940.05 / 2084.89 | 0.956 | None |
| textured-scene-save | 9055.62 / 3463.23 | 335.28 / 148.35 | 2764.17 / 2615.25 | 0.677 | None |

All ten workloads meet the unchanged targets in this pair. Input targets are 100 ms p95 and 250 ms maximum. Frame-gap targets are 50 ms p95 and 100 ms maximum, with no task above 50 ms. Completion, sampled heap and backing storage, and sampled summed process RSS permit at most a 1.1 ratio. The on-demand report records these targets without adding a merge gate, retry or deadline. No candidate long task was recorded above the observer threshold. Catalog sampled heap and backing storage has the narrowest margin, at a 1.098 ratio.

This is one observation per arm and workload, not a repeat-until-pass result or a general latency guarantee. Input observation ends after the requested state effect and the next frame, without measuring physical scanout. Worker CPU is traced dedicated-worker task CPU. Raw reports retain round-trip and message-send distributions separately. Process memory is sampled every 100 ms, counts shared pages repeatedly, excludes GPU allocations and can miss peaks. Renderer heap and backing storage exclude native worker allocations. These are macOS measurements, without Linux or Windows performance claims.

`scratch/workflow-fe8b-pair.json`, its baseline and budgets files, and their sibling trace and durable-record directories retain the observations. Focused correctness assertions for atomic edits, geometry identity, Stop, undo/redo, source changes and save order remain in the declared unit and composer browser tests. Local e2e execution remains outside this lane. Current-source changed-file validation is recorded separately in `scratch/check-fe8b-all.log` and `scratch/check-fe8b-inputs.json`.

## Final merged workflow comparison on fe8b

The final source removes the unnecessary shared BOM type edit and resolves materials in compact print inputs. It also restores direct ordinary-model preparation in existing worker and headless realms, retaining renderer worker dispatch and contact validation. The two acceptance-first regressions and their passing focused checks are recorded in the [printing note](performance-printing.md#resolved-material-in-compact-report-inputs) and [simulation note](performance-simulation.md#ordinary-model-preparation-stays-local-in-worker-realms). Neither correction adds a wait, gate, retry or deadline.

The preceding fe8b pair characterizes the earlier source. Its changed-file selection passed 5,528 tests and failed eight test deadlines and one electrical setup deadline across eight files. These include recorded scan reconstruction, finger lifecycle, body-motion previews, Motor Kit transitions and CLI evaluation. They do not establish a shared cause. Exact failures remain in `scratch/check-fe8b-all.log`. Their owners, quarantine and restoration conditions remain unchanged.

Both final production arms use main `fe8b2ac8b9cb08843e074372761d6341e630407a`, pinned Node 26.13.1, the same generated manifest and the same windowed Chrome 157.0.8103.79 with Metal on the Apple M5 Pro. Per-file hashes, manifest hash and bundle paths are in `scratch/source-fe8b-final-ledger.json`. Arms alternate by workload. No own check, build or separate profile overlaps this pair. Every cell lists baseline then candidate.

All twenty observations saved and reopened their accepted edits with fresh Checks and no browser errors. All ten candidates recorded orbit, selection and Inspector changes during actual request intervals. Articulated Case observations completed twenty seeds per retained verdict. Total completion fell from 34,233 ms to 13,362 ms. This is a combined pipeline comparison, not an isolated speed ratio for either final correction.

| Workload | Completion ms | Input p95 ms | Input max ms | Long-task p95 ms | Long-task max ms | Frame-gap p95 ms | Frame-gap max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| primitive-insertion | 4582.00 / 1215.00 | 30.63 / 34.10 | 46.61 / 39.22 | 0.00 / 0.00 | 0.00 / 0.00 | 9.84 / 9.97 | 25.60 / 16.66 |
| imported-mesh-replacement | 1091.00 / 784.00 | 42.64 / 39.56 | 58.59 / 39.56 | 0.00 / 0.00 | 0.00 / 0.00 | 10.20 / 10.07 | 25.79 / 25.02 |
| boolean-editing | 1070.00 / 664.00 | 39.78 / 32.68 | 44.53 / 32.68 | 0.00 / 0.00 | 0.00 / 0.00 | 10.32 / 10.32 | 25.01 / 18.43 |
| sketch-regeneration | 2177.00 / 968.00 | 36.71 / 34.48 | 50.79 / 35.20 | 0.00 / 0.00 | 0.00 / 0.00 | 10.29 / 10.31 | 26.92 / 16.14 |
| catalog-assemblies | 2116.00 / 1208.00 | 43.87 / 47.40 | 118.05 / 55.08 | 115.00 / 0.00 | 115.00 / 0.00 | 9.75 / 10.33 | 109.59 / 25.66 |
| joint-authoring | 674.00 / 649.00 | 42.56 / 34.63 | 42.56 / 34.63 | 0.00 / 0.00 | 0.00 / 0.00 | 10.30 / 10.31 | 24.66 / 18.31 |
| articulated-case-edits | 2366.00 / 1877.00 | 34.33 / 34.39 | 68.84 / 41.04 | 0.00 / 0.00 | 0.00 / 0.00 | 10.14 / 10.01 | 26.53 / 24.89 |
| multi-part-transactions | 14189.00 / 1283.00 | 33.46 / 34.21 | 53.94 / 37.22 | 0.00 / 0.00 | 0.00 / 0.00 | 10.15 / 9.96 | 24.99 / 16.66 |
| history-checkpoints | 1924.00 / 1570.00 | 68.47 / 33.04 | 76.38 / 33.14 | 51.00 / 0.00 | 51.00 / 0.00 | 10.34 / 9.76 | 49.98 / 24.99 |
| textured-scene-save | 4044.00 / 3144.00 | 186.45 / 37.99 | 325.62 / 84.20 | 127.00 / 0.00 | 127.00 / 0.00 | 33.34 / 10.18 | 192.44 / 25.00 |

| Workload | Worker CPU ms | Sampled heap and backing MiB | Sampled summed RSS MiB | Completion ratio | Violations |
| --- | ---: | ---: | ---: | ---: | --- |
| primitive-insertion | 884.04 / 2329.95 | 283.16 / 80.45 | 1924.70 / 1725.39 | 0.265 | None |
| imported-mesh-replacement | 767.12 / 795.81 | 103.70 / 78.79 | 1647.27 / 1664.11 | 0.719 | None |
| boolean-editing | 1012.27 / 552.34 | 111.50 / 68.35 | 1661.17 / 1589.91 | 0.621 | None |
| sketch-regeneration | 458.84 / 732.18 | 187.32 / 117.60 | 1773.12 / 1736.42 | 0.445 | None |
| catalog-assemblies | 1150.54 / 2228.76 | 180.73 / 180.64 | 1933.22 / 1955.75 | 0.571 | None |
| joint-authoring | 810.75 / 1097.05 | 84.96 / 67.84 | 1519.67 / 1544.34 | 0.963 | None |
| articulated-case-edits | 6018.68 / 6780.94 | 99.62 / 71.63 | 1987.86 / 2022.55 | 0.793 | None |
| multi-part-transactions | 944.12 / 2231.45 | 347.54 / 97.03 | 2018.92 / 1805.03 | 0.090 | None |
| history-checkpoints | 1337.62 / 932.70 | 157.71 / 104.34 | 1976.36 / 2010.02 | 0.816 | None |
| textured-scene-save | 4647.16 / 2683.92 | 295.76 / 167.56 | 2634.47 / 2508.53 | 0.777 | None |

All ten workloads meet every unchanged target. Input targets remain 100 ms p95 and 250 ms maximum. Frame-gap targets remain 50 ms p95 and 100 ms maximum, with no main-thread task above 50 ms. Completion and both sampled-memory comparisons permit at most a 1.1 ratio. No candidate long task was recorded above the observer threshold. Every candidate operation completes faster than its paired baseline. Every sampled heap-and-backing peak is at or below baseline. The largest summed-RSS ratio is 1.0175. The report still lists violations without failing a check or adding a merge gate.

This is one observation per arm and workload, not a repeat-until-pass result or a general latency guarantee. Input observation ends after the requested state effect and the next frame, without measuring physical scanout. Traced worker CPU is separate from queue-inclusive round trips and message-send distributions in the raw data. The 100 ms process sampler can miss peaks. Summed RSS counts shared pages repeatedly and excludes GPU allocation. Renderer heap and backing storage exclude native worker allocations. These macOS observations do not establish Linux or Windows performance bounds.

Raw observations, traces, worker messages, process samples and real durable designs remain beside `scratch/workflow-fe8b-final-pair.json`. Final changed-file validation and exact hashes are in `scratch/check-fe8b-final-all.log` and `scratch/check-fe8b-final-inputs.json`. Focused browser correctness remains with CI, without local e2e execution or timing gates.

The final 146-file changed check passed format, lint, types, docs and all 387 site pages. Its 745 related files reported 5,052 passing tests and one existing skip in 71.13 seconds. Removing the unnecessary shared BOM edit narrows the final selection. Earlier failures outside that selection are not claimed repaired. Source changes and cache conditions both differ from the preceding selection, so these durations do not isolate the effect of either correction. No timeout, retry, quarantine or owner restoration condition changed. Every production source hash still matches the measured final bundle. Only coverage and measurement documentation changed afterward.

### Composer workflow CI locator correction

Pull request #2037's Linux changed-browser job reached the return from a blank scene, then failed at `agentEditing.e2e.test.ts:126` on both configured attempts. The lookup required the exact idle tab name `Agent`, while the running tab's labelled spinner contributes `Agent working` to that name. The failure occurred before Stop, with a 30,000 ms locator deadline. Layers windowing passed in the same job. The aggregate Check failed because this browser job failed, with its other required results successful.

The walkthrough now selects the tab containing the `Agent working` image before clicking Stop. This retains scene switching, cancellation of held geometry, accepted-edit persistence and durable reopening in one broad test. No timeout, retry configuration or production code changes. No quarantine applies. Local execution remains limited to changed-file validation, with browser execution left to CI.

The three-file revision check passed formatting, lint, docs and types. Its output is `scratch/revise-2037-check.log`. Browser tests were not run locally. Preflight reports only the 32 unchanged help articles already assessed in the preceding pass, without copy findings. The revised guide adds test-locator coverage only. Rechecking `the-design-agent.md` found no changed task, label or screenshot to update.

The preflight follow-up read all 32 flagged articles against their covered changes on the merged source. Layers windowing keeps search, selection, rename and visibility actions. Worker-backed reports retain exports, guide order, print estimates and labels. Model caching and cancellation retain Case seed counts, Arena judgments and self-contact validation. Request scopes retain composer controls, Stop and undo. No article step, label or referenced image needs replacement. Every referenced image exists. Article hashes, covered paths and individual reasons are saved in `scratch/revise-2037-help-assessments.json`. These unchanged-article notices remain mechanically reported by preflight, which does not consume assessment records.


## Windows composer prompt entry on Check 46075290592

[Check 46075290592](https://github.com/JamelHammoud/basecase/actions/runs/46075290592) at `3bcc9cde87a8414cf77edfbd4e1e1ed0a8b1febb` failed the Windows composer-editing declaration on both existing attempts at line 66. The fixture workspace id remained empty after Send, so its prompt handler had not received acp-prompt. Accepted editing, held geometry, orbit, Inspector changes, Stop and reopening had not begun. The log does not distinguish durable baseline preparation, persistence, model listing or prompt dispatch.

Exact-revision [Windows diagnostic 46077790004](https://github.com/JamelHammoud/basecase/actions/runs/46077790004), ticket `517d825e-4622-479a-8fad-b5bae841ebfc`, passed the complete declaration in 45,398.4029 ms, with a 57,346 ms process. It used Windows x64, four CPUs, Node 26.13.1, image `20261123.321.1`, one worker, zero retries, quarantine off and action tracing. The same 48-part fixture retained accepted edits through real scene storage and reopening. The final browser snapshot had no console errors. Its process still reported the ten-second Vite close warning despite an empty manifest cleanup array.

Classification is intermittent Windows execution at the exact failed revision. This single traced pass does not establish a failure rate, identify the missing prompt's cause or validate a performance improvement. No source or fixture behavior changes. The complete composer declaration and fast transaction, conflict, cancellation, undo/redo and durable baseline tests remain active. [Shared diagnostic evidence](node.md#diagnostic-stream-retention-on-check-46075290592) retains runner identity and the separate log-retention correction. No exclusion, retry, timeout or assertion changes.

## Preview updates preserve concurrent scene saves

[Check 46086809992](https://github.com/JamelHammoud/basecase/actions/runs/46086809992) at `c940e1474e604a3126c4c809d89a7b9f006b1351` failed the Windows appearance declaration after reload. Its first attempt observed texture scale 25 in memory and IndexedDB, then reopened scale 10. Its second attempt exhausted the 180-second callback without a final stage trace. The Linux appearance declaration passed that revision. That cross-platform difference does not establish Windows intermittency.

The browser preview implementation read a full scene with a readonly transaction, then wrote that captured record and its summary in a later transaction. An ordinary save between those operations was overwritten. This is a source race that predates the last full green revision `04c830ec7de8eabf859ad011c6e143466529daab`, rather than an identified newly broken merge. The regression controls that interleaving without a browser or wall-clock wait. Against the original implementation it fails with name Arm instead of Edited arm, with eight other scene tests passing. Against the candidate it preserves the newer name and parts together with the new preview and unchanged save time.

Preview publication now reads the scene and updates both stores in one readwrite transaction. IndexedDB orders overlapping scene writes and deletion against that transaction. Preview writes do not republish history through the history worker. `idbWrite.test.ts` checks the read and both writes on the same transaction, refusal before commit and rejection after abort. Existing world-asset and history tests remain selected. No queue, timer, retry or new gate is added. This proves the source race is repaired, not that it caused every Windows callback failure. The appearance browser declaration remains unchanged for CI.

Local macOS validation at base `40d6f6458e0b0b85b20682b21ab95e879c9a8c1c` with these uncommitted inputs passed 3,333 tests across 466 files, with one existing skipped file, in 54.69 seconds through the four-file changed check. The intentional original-source regression failed in 77 ms. Logs: `scratch/check-scenes.log` and `scratch/check-scenes-baseline.log`. No local browser run or visual judgment was made.

Focused [Windows diagnostic 46090315730](https://github.com/JamelHammoud/basecase/actions/runs/46090315730), ticket `5bd7b373-a3c9-4aa5-bd2d-09356d263ee8`, reproduces the scale-25-to-10 reload mismatch at the exact nightly workload. It failed its only selected attempt in 25,374.8681 ms, with a 48,097 ms process, one worker, zero retries and quarantine off. The host was Windows x64, Node 26.13.1 and image `20261123.321.1`. This is a reproduced persistence failure rather than evidence of intermittent load. Candidate browser verification awaits the existing publication Check. The deterministic regression already distinguishes the old and repaired source without changing that browser declaration.


## Autosave retains Redo over a pending Undo

[Check 46123941202](https://github.com/JamelHammoud/basecase/actions/runs/46123941202), workload `31299fe9dac85f4a39ff21c0392790bcf61856ce`, failed the Windows Appearance story after its live scene and IndexedDB equality checks had observed scale 25. Reload returned scale 10 for both parts. Its other attempt exceeded the unchanged callback deadline without a final stage. The prior transactional preview correction was already present, so it does not establish a repair for this observation.

The autosave source compared every edit only with its last queued draft. Starting from saved scale 25, Undo queues scale 10. Redo restores the same immutable scale-25 records as the last saved draft, so the comparison returned early without replacing the pending scale-10 draft. A later flush could therefore write the undone design after the browser had observed the saved scale-25 record. This is an ordering-dependent source defect, without a responsible introducing merge established since the last full green `04c830ec7de8eabf859ad011c6e143466529daab`. It is not Windows-specific logic.

`workspace/useAutosave.test.ts` reproduces that exact 25-to-10 write on the original source in a controlled macOS Node test. The same test reproduces a reverted scene name. The original-source run passed the in-progress-write control. Change detection now compares against the pending draft when one exists. The regression also covers project settings and a Redo queued behind an already started Undo write. It uses controlled hook effects, clocks and serialization boundaries with the real per-scene write queue. It does not launch Chrome or replace the browser acceptance story. No additional wait, retry, deadline or exclusion is added.

The focused source-and-test check under Node 26.13.1 passed formatting, lint, TypeScript and ten related tests across four files. Its test phase took 398 ms on macOS arm64. Logs are `scratch/autosave-before.log` and `scratch/autosave-after.log`. Hosted candidate delivery remains for the publication Check. The Windows source failure and this local deterministic regression do not establish a Windows candidate pass or a failure rate.

Exact-revision [Windows diagnostic 46127522554](https://github.com/JamelHammoud/basecase/actions/runs/46127522554), durable ticket `eb22b82e-03e5-4f50-99a4-4789432a964b`, passed the unchanged complete Appearance declaration in 16135.4794 ms, within a 38884 ms process. It used one worker, one independent attempt, zero retries and quarantine off, on Windows x64, four CPUs, Node 26.13.1 and image `20261123.321.1`. Together with the nightly failure at the same `31299fe9dac85f4a39ff21c0392790bcf61856ce`, this establishes Windows intermittency before this candidate. It measures no candidate rate. The controlled pending-draft regression identifies a source mechanism independently. Artifacts remain under `scratch/diagnostics/eb22b82e-03e5-4f50-99a4-4789432a964b/` during implementation.
