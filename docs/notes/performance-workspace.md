# Scene storage and startup performance

Implementation: [Scene storage and startup](../guide/scene-tabs.md#performance-scene-storage-and-startup). Shared requirements: [Performance](../guide/performance.md).

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

The acceptance tests retain the ten design cases across the graph, merge and shared Case suites. The retained browser declaration covers the history entry point, close and reopen, restore and reload. Cross-platform browser execution remains a CI observation, rather than a local claim.

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
