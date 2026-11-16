# Build test evidence

Current coverage: [owning guide](../guide/build.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## BOM cable stock

The duplicate cable browser test was removed after taking 45 s and failing in run 43721538732. It searched for the provisional Bus Servo Cable row, which measured stock replaces. The previous green run 43715791435 passed it only on retry on both Linux and Windows.

## Falls

The Falls browser test in `e2e/buildCheck.e2e.test.ts` was narrowed under [#1094](https://github.com/JamelHammoud/basecase/issues/1094). In run 43715791435 it took 50.166 s on Windows and 32.196 s on Linux, while the matching `src/utils/engineeringFalls.test.ts` Node test passed in 690 ms and all nine Falls tests passed in 3.961 s on Linux.

## Build Along

The combined Cable reach walkthrough took 59 s in run 43715791435 ([#1091](https://github.com/JamelHammoud/basecase/issues/1091)). For `e2e/buildCable.e2e.test.ts`, before the viewport and label assertions were added, it took 8.901 s on Linux and 12.602 s on Windows in run 43739315274. The separate guide-generation walkthrough was removed under [#1152](https://github.com/JamelHammoud/basecase/issues/1152) after taking 35.169 s on Linux and 26.724 s on Windows in run 43739315274. The responsible stage was not isolated. The separate arm readiness browser test and its Windows quarantine were removed under [#859](https://github.com/JamelHammoud/basecase/issues/859) after it took 32 s in run 43642970706.

The retained tests do not cover the complete palette-to-generated-guide browser path.

## Parts on hand

The duplicate browser test was removed after taking 64 s in run 43642970706 and failing repeatedly on Windows (#851, #836).

## Passive robot joints

Passive declarations do not create missing-servo or torque-estimate warnings. They remain in the rig and range sweeps. Payload mapping rejects a chain containing passive motion rather than using an old effort rating as a motor. Walk and falls keys hash full declarations, so changes invalidate cached evidence without a new version or cache format.

## Manufacturing kit export

Classified as a commit regression introduced by `93e274222ab1d2a7046d87546aa12a3deb748489` (#1323). The last green nightly, [run 43739315274](https://github.com/JamelHammoud/basecase/actions/runs/43739315274), checked `acb6bad2f3fb2acc770cdb2f885415d14c086a67` before that merge. In [run 43820519938](https://github.com/JamelHammoud/basecase/actions/runs/43820519938) at `017a5f2a7313ce68c18a51acc390cef00b7f2084`, both desktop and web cases in the new kit browser test clicked Export ▸ Kit but never observed `kit-arm-kit.zip` within the existing download poll. Both attempts of each case failed. Reported durations including retries were 23.948 s for desktop and 32.761 s for web.

The feature's [PR Check run 43809336475](https://github.com/JamelHammoud/basecase/actions/runs/43809336475) selected the kit test file but produced an empty test-name pattern for its multiline `it.each` declaration. The browser job therefore ran no tests. Its green result is not a passing kit observation. The nightly log contains neither an export error toast nor preparation-stage evidence, so it does not establish a geometry, guide, worker or compression cause. No platform-only or flake classification is established.

Repair #1360 reverted the kit feature, its two browser cases, help pages and announcement together. The only revert conflict was the printing performance note, where the later service-quote evidence is retained. The independent Checks timestamp correction and its regression test from the same merge are retained. No assertion, timeout, retry or quarantine is changed. Separate plate, guide and Robot Package workflows remained available. That repair retained no combined-kit coverage.

### Restored production path

The selector dependency is on main as `129c2956c` (#1369). The restored browser declaration has separate desktop and web cases with a fresh `openApp` per case. The entry fixture keeps one exact c001 servo as the stationary base and one printed moving arm. It retains every archive assertion while avoiding a third base part and its extra illustrated step. Full robot geometry, quantities and repeated workflows remain in the ten-case fast matrix. The web fixture is seeded before app startup through the existing IndexedDB scene migration path, so the first-launch rover cannot start in the background. Both cases assert no active Case and no first-launch rover fetch. It listens for Playwright’s actual download event and reads the saved file. It checks the illustrated guide, packing, exact c001 servo map and a real 3MF mesh, with empty app errors. `tools/e2e-kit-selection.test.mjs` parses this declaration with the production selector and matches both substituted names. Changes outside the declaration select the whole file. PR CI therefore receives both cases through its existing precise-name or file fallback path. No browser timeout, retry or quarantine changes.

Local production captures reproduced the missing-download observation while the progress toast remained active, without an app error or preparation exception. Boundary tracing then showed the archive reaching compression and download successfully. Illustrated guide rendering dominated the measured preparation. The three-part desktop archive delivered in 6,096 ms, and the 39-part repeated fixture delivered in 34,455 ms. A web capture delivered in 9,815 ms after an earlier ten-second observation missed it. The exact stage of run 43820519938 cannot be recovered from its logs. The reproduced latency problem is not evidence of a broken browser download API. [Preparation timings and memory limits](performance-printing.md#manufacturing-kit-composition) record the method and observations.

Preparation errors now include their boundary and underlying message. Performance entries named `kit:<stage>` retain the latest duration and structured error per stage. Download failure logs include those entries even after a toast disappears. Missing catalog geometry stops before guide preparation. Source limits stop oversized jobs before geometry work, and archive limits stop oversized expanded contents before compression. Interrupted work, source replacement and printer edits discard prepared or compressed output. A fresh model supplies joint-map names and limits even when simulation retains an older model.

`kit/buildKit.test.ts` exercises ten generated workflows with real BOM, guide planning, plate, sheet and joint-map producers. The matrix reconciles packing demand, owned versus remaining stock, output copy counts, material files, wiring endpoints and servo identities against archive contents. It includes stale and absent Checks, incomplete guide coverage, missing geometry and plate output, unsupported fabrication and mismatched identities. `workspace/kitExport.test.ts` covers preparation exceptions, cancellation, scene identity replacement, printer changes and interrupted compression. The real WebGL guide test reproduces full-page target churn and checks pixel parity after removing it and redundant shader sampling.

The first local checks stalled during shared Vitest cache cleanup before reaching tests. Package links in this worktree were kept while cache directories were isolated locally. No tracked configuration or test policy changed. An initial dev-server capture failed at navigation and is not export evidence. Production bundle captures replaced that setup. Vite reported a ten-second teardown warning after some completed captures, separately from download results. Linux and Windows observations come from the published PR checks, not this macOS session.

Before single-pass rendering, the servo-base entry capture delivered its desktop archive in 3,579 ms. The isolated web capture seeded the saved scene before startup, asserted no active Case or first-launch rover fetch, and delivered through the real browser download within the unchanged ten-second wait. Both captures inspected production archive contents with empty app errors. The broader repeated fixture delivered in 28,106 ms in that measured guide path. Host contention can still extend preparation beyond a short observation, and the historical nightly logs cannot establish which stage was active there.

The full changed-file selection passed 2,222 related tests across 354 files, with one existing test skipped. After extracting the matrix assertions to satisfy function limits, its 24 tests passed. Later entry, isolation and structured-error changes received focused changed-file checks. The source and artifact checks are local macOS observations. CI remains responsible for published Linux and Windows walkthrough results.


The final guide worker uses a disposable strict worker and one geometry pass for its normal, ID and color textures. Its real WebGL regression compares PNG bytes to the previous three-pass renderer from three views, checks fewer draw calls and injects a shader compilation fault. The source-ownership tests check unavailable workers and interrupted work without permitting interaction-thread rendering. The focused guide check passed sixteen tests. Desktop and isolated web captures completed in 3,203 ms and 7,458 ms respectively through real downloads, with every archive assertion and empty app errors. The final archive adds printer-plan and file-specification provenance. Its small and repeated-fixture samplers completed in 4,536 ms and 23,866 ms. The last final-archive walkthrough capture missed its ten-second desktop deadline while guide preparation remained active. Completed stage entries stopped after assembly search, with no app error or compression entry. This is an unresolved latency finding, not passing final walkthrough evidence. That full-render browser path is replaced by the controlled guide boundary described below. Its latency remains unresolved. The performance note retains the measurements and limits.

### Restore Check failure on 16 November

Both desktop and web downloads exceeded their unchanged 10,000 ms wait in the restored PR Check. Every attempt still showed Exporting kit, and completed preparation entries ended at assembly search. Catalog geometry took 3.74 to 17.46 ms, part measurement took 28.10 to 148.30 ms, and assembly search took 2.39 to 4.89 ms. No Build guide completion or archive-compression entry appeared. The aggregate check failed because e2e-changed failed. Its other required jobs passed.

The revision removes per-sample direction dispatch from the outline shader, stops sampling after full-strength ink and computes the winning ink color once. The reference composite is frozen independently of production shader edits. An explicit fixture import makes related-test selection include these WebGL checks. The download tests, archive assertions, deadlines, retries and quarantine remain unchanged. Local full-app walkthroughs were not rerun in this revision. These changes do not establish a passing desktop or web CI download.


### Separate rendered-guide work from browser delivery

The next Check again missed every 10,000 ms download wait. Including retries, desktop took 32.778 s and web took 36.388 s. Completed boundaries ended at assembly search on all four attempts. Catalog geometry took 5.07 to 12.67 ms, measurement took 9.57 to 609.64 ms, and assembly search took 1.55 to 326.57 ms. No guide completion, compression result or error toast appeared. The aggregate Check failed solely because the browser job failed.

The two slow browser stories now control only the illustrated-guide worker reply through a context route, on both desktop and web. The fixture reads the actual transferred job, runs the real guide planner with its assembly order and composes the real HTML document with fixed image data. It does not replace the archive worker, meshes, measurements, assembly analysis, plates, wiring, joint-map generation or download. New assertions check a single guide job, its scene part identities, joints, assembly coverage and byte-for-byte HTML delivery. All original archive assertions and the ten-second download wait remain.

The ten-scene `kit/buildKit.test.ts` matrix retains packing and producer reconciliation coverage. `workspace/kitExport.test.ts` retains source replacement, errors and cancellation coverage. `guide/generateGuide.test.ts` retains worker refusal, ownership and interruption coverage. `guide/render/guideStage.test.ts` retains real WebGL PNG parity from three views, visibility and compile-error refusal. Together these cover the delivery contract without rendering a full booklet in each browser case. No timeout, retry, assertion or quarantine is relaxed. No full-app tests were run locally in this revision. CI still has to establish the revised browser results. Full-size guide latency and the combined real-render-to-download path remain coverage gaps, not passing observations.

The targeted changed-file check passed formatting, lint, types, documentation and site copy for 288 pages, plus 48 tests across the five explicitly selected coverage files. Preflight reported only the eleven unchanged covered articles. Each was reread against the complete feature diff. Robot Package, STEP, STL, plates, import, shared-scene opening and scene sharing retain their labels, handlers and output contracts. Saved guides keep their persistence, viewer and update behavior, and shader PNG parity passes. Part-kind, sourcing and Real parts articles describe unchanged classification and source checks, while the BOM edit only multiplies filament demand by print copies. Their instructions and referenced states remain accurate, so those articles remain unchanged under preflight's explicit exception.

### Review source-size correction

The source guard previously selected only the first CAD, mesh or sculpt payload on a part. Sculpt edits retain the earlier geometry, so an oversized sculpt could pass behind a small CAD payload. Geometry in boolean operands and custom-model nodes was also omitted. The guard now sums those retained and nested payloads before preparation, including CAD edges and contour and lathe profiles, using array lengths. `kit/limits.test.ts` checks the exact boundary and refusal when combined or nested geometry exceeds it without allocating oversized meshes. The existing workspace test verifies that oversized sources stop before catalog preparation. This corrects source accounting without changing the archive limit, browser deadlines or the recorded full-render coverage gap.


## Workflow copy cleanup

Issue #1490 consumes the existing `tools/copy-diff.mjs` report from `b6137663b` to the task's starting HEAD, with its bounded source context. Composition was then read directly. That range describes shipped changes since 9 November, rather than reproducing the issue's 182-merge baseline. No copy extractor or gate changes.

| Pattern | Before | After | Information retained |
|---|---|---|---|
| File delivery repeated by a toast | STL, image, scene, 3MF, USDZ, Kit, Robot Package and both BOM formats downloaded a file and announced Exported again | The file download supplies success feedback. Long exports dismiss their progress toast | Filenames, output bytes, errors, cancellation, clipboard confirmation, AirDrop handoff and partial STEP warnings |
| Selected site repeated as a heading | Choosing a named site left its selected option above an identical site heading | The selector supplies the site name | Site selector accessible name, facility filename, source units, axis, registration, floors and robot details |
| Field label repeated by an arbitrary example | The robot computer User field showed the example robot beneath User | The visible label names the empty field | User accessible name, host example, platform key-path example, installation state and pairing result |

The Training pane stays unchanged. Its key-path hint explains that SSH identity takes an existing file path. Its host-key instruction requires an independent comparison. Attempts explains shared budget semantics. Train on distinguishes the selected destination from editable connection fields. These supply requirements, consequences and identity rather than repetition.

Classroom also stays unchanged. Its name placeholder supplies the only visible cue for the name input. The assignment paragraph retains the reference-controller constraint, budget and fingerprint limitation. Grading results, errors and deletion confirmations remain. Training-image camera and class headings distinguish the two switch groups and remain.

The existing Robot Package browser walkthrough now waits for the real download instead of the removed success toast, using the existing 30-second completion deadline. It checks the filename and download failure, then retains package contents, joint map and simulation XML assertions. Existing Kit, Build export, Fleet, classroom, remote training and network-connection walkthroughs retain their actions and outcome assertions. Browser execution belongs to CI. No browser sweep, retry, wait loop or deadline increase was added.

`node tools/copy-diff.mjs HEAD` reports 0 added, 0 changed and 8 removed occurrences, net -8. Both BOM toast calls and the dynamic site heading are additional removals outside this extractor's counted surfaces. This is the current command's accounting, without changing its contract.

Preflight flagged eleven existing help articles for source coverage. `export-a-robot-package.md` now describes progress dismissal and drops its obsolete success-toast image. `export-a-robot-kit.md` drops the redundant desktop and web success images and retains the menu screenshot and all actions. The other nine articles remain true: Count the parts you already own, Export an STL file, Export plates as 3MF, The path from design to build, Get a robot ready to build, Import and export formats, Open Basecase Fleet, Register a Fleet facility and Share a scene. Their steps do not depend on a removed toast, heading or example. No action, format, key, readiness verdict or instruction changed. Fleet's selected site also names its section for assistive navigation.

The focused ten-file `check:changed` run passed formatting, lint, docs, types, site checks for 295 pages and 13 related tests across seven files. The final documentation and accessible-section check also passed all stages, including the same 13 related tests. No local browser execution or visual judgment was performed.


### Covered help recheck

The nine unchanged articles named by preflight were reread against the final diff for #1490. The table records why each stays unchanged under the command's explicit exception.

| Article | Source boundary checked | Result |
|---|---|---|
| `count-the-parts-you-already-own.md` | `BuildPanel.saveOnHand` still saves the count and supplies Undo. Only `exportCsv` and `exportMarkdown` lose their success toast | Quantity editing, totals, On hand screenshots and Undo instructions remain applicable |
| `export-an-stl-file.md` | `exportStl` still downloads the same viewport bytes with the same scene filename. Export menu availability is unchanged | STL actions, units, hidden-part handling and menu screenshot remain applicable |
| `export-plates-as-3mf.md` | `export3mf` still writes the same job and downloads the same material files. Only the final toast is removed | Plate actions, filenames, orientation and menu screenshot remain applicable |
| `from-design-to-build.md` | BuildPanel changes only the two BOM export callbacks | Readiness, purchasing, manufacturing and kit handoff descriptions remain applicable. This article has no screenshots |
| `get-a-robot-ready-to-build.md` | ChecksSection wiring, focused checks, selection, fixing, ignoring and restoration are unchanged | All Check actions and referenced Check and Settings states remain applicable |
| `import-and-export-formats.md` | `useExportActions` retains the same producers, filenames, share handoff and clipboard confirmation | The format table, units and image-capture behavior remain applicable. This article has no screenshots |
| `open-basecase-fleet.md` | FleetInventory still supplies Site, selected site names, inventory, Reload Fleet and robot status. FleetSite preserves the selected name as its accessible section label | Entry, authentication, selection and access-recovery steps remain applicable. No step refers to the removed heading |
| `register-a-fleet-facility.md` | FleetSite retains upload, registration, source metadata, floor filtering and map callbacks | Registration steps and illustrated controls remain applicable. The selected Site supplies the facility identity without the duplicate heading |
| `share-a-scene.md` | `exportScene` still previews, encodes and downloads the same shared scene. Only its final toast is removed | Scene export steps, payload exclusions, filename example and menu screenshot remain applicable |

No article asks the reader to find a removed success toast or site heading. No screenshot reference describes either as its subject. This recheck adds no article text merely to clear a source-coverage reminder, and does not change preflight or its checks.
