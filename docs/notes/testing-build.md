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

Fleet's Site selector supplies the selected site's visible name. The facility section uses that name as its accessible label without repeating a visible heading. The robot computer form keeps the User label and removes its arbitrary username example. Host and SSH key examples, installation requirements and pairing results remain.

Export confirmations remain under [Copy](../guide/copy.md) §3b-13 because their results are outside the canvas. `downloadBytes` starts an anchor download and does not render a result in the studio. STL, image, scene, 3MF, USDZ, Kit, Robot Package and BOM exports retain their success toasts. The Robot Package and Kit help articles retain their success screenshots and instructions.

`e2e/robotPackage.e2e.test.ts` checks the actual download's filename and failure status in addition to its existing success-toast and package-content assertions. Its download event uses the existing 30-second completion deadline. No assertion, timeout, retry or quarantine is weakened. Browser execution remains with CI.

## Supplier spreadsheet handoff

The purchasing matrix runs the real BOM projection and CSV formatter, then reads the exported text through a separate state-machine parser in `e2e/bomCsv.ts`. Expected records declare exact identities, remaining units, packaging and stable references independently. Cases cover exact supplier data, partial and full owned stock, repeated components, known multipacks, packaging-specific numbers, mixed suppliers, manufacturer-only and unknown identities and changed listings after JSON reload. Additional cases cover Unicode, CSV delimiters and quotes, formula-like text, conflicting catalog and purchase identities, invalid conversions, the complete reference list beyond the older twelve-name display limit and purchase edits while wiring preparation is pending.

The persistence cases pass optional supplier metadata through the existing sourced-tool schema and filesystem store. They check reload, product-link replacement, HTTPS provenance and unknown conversions. Purchase disk tests retain the identity, stock and corrected listing. Existing BOM, Amazon cart and manufacturing-kit tests retain their cost, pack and total-demand assertions.

The first broad changed-file check selected 639 files. It reported 629 passed, nine failed and one skipped, with 34 failed tests. Most failures were simulation timeouts at their existing deadlines, and classroom aggregation assertions also failed after timed-out seed cases. This observation does not establish whether those failures reproduce on main or on Linux and Windows CI. No deadline, retry, quarantine or test assertion was changed.

A focused changed-file run of the purchasing tests reported four files and 34 tests passed in 769 ms. That was an intermediate source snapshot, before the final normalization assertions. The browser walkthrough is declared in `e2e/bomPurchasing.e2e.test.ts` for the existing Linux and Windows CI harness. It opens a generated arm with three Pico 2 boards in the BOM, edits the listing and owned stock through existing controls, parses the real CSV download, reloads the saved scene and repeats, then corrects the packaging-specific supplier number. No supplier website is automated. Supplier matching, external upload acceptance and manufactured electrical performance remain unmeasured.

### Final implementation validation

On 16 November 2026, the final named-file `check:changed` run selected 644 test files. It passed 643 files and 4,460 tests, with one existing skipped file and test, in 115.78 seconds. Formatting, ESLint, TypeScript, documentation and the 301-page site check passed. A follow-up check for the browser helper, reload comparison and help wording passed its eight related purchase-form tests. The browser walkthrough itself remains for Linux and Windows CI, as required by this task's local-check policy.

An earlier broad run on the same shared host selected 639 files and reported 34 failures across nine files, mostly simulation deadlines, with 4,372 passes. That result did not establish a purchasing regression or a baseline failure. No timeout, retry, quarantine or test policy changed. The completed final run above is the retained validation result.

The focused purchasing run independently parsed production CSV for the ten purchasing cases and passed 34 tests across four files before the final run. The later purchase-form case checks editing and trimming identity facts. Supplier tests cover exact variant projection, descriptive-family suppression, sourced metadata through the tool schema and disk persistence, whole-record corrections and missing or unusable conversions. Existing cart, BOM and manufacturing-kit cases retain their quantity and cost assertions in the final related-test selection.

A throwaway capture drove the existing Build price sheet and stock control and saved the identity and spreadsheet-menu states in `site/public/help/export-remaining-purchases/`. It completed without changing the browser harness. Earlier capture attempts reached the existing navigation deadline while the shared host was busy. Captures were collected for the help article without judging appearance. They are not evidence that a supplier accepted the file.

DigiKey's [MyLists page](https://www.digikey.com/en/mylists) documents file upload, and its [spreadsheet explanation](https://www.digikey.com/en/blog/q-a-from-digi-keys-list-management-webinar) documents Customer Reference mapping. Its [Pico 2 listing](https://www.digikey.com/en/products/detail/raspberry-pi/SC1631/24627136) declares manufacturer SC1631 and separate 2648-SC1631CT-ND and 2648-SC1631TR-ND supplier numbers. The browser fixture uses these declared identities and records a cut-tape piece ordering unit. No external upload, match, availability, checkout or physical assembly was tested. Manufacturing-kit total demand and supplier-specific ordering semantics remain distinct from owned stock and price packs.

### Filename assertion correction

The 16 November 2026 PR #1560 Linux Check failed at the first download's exact filename assertion. The fixture names its scene `Purchasing arm`, and Build uses the case-preserving `fileStem` helper. The browser delivered `Purchasing-arm-bom.csv`, while the test expected `purchasing-arm-bom.csv`. Both attempts failed at the same assertion. The aggregate Check then failed because `E2E_CHANGED` was `failure`, with all three required jobs successful.

The helper now expects exactly `Purchasing-arm-bom.csv`. Download failure, CSV contents, saved-scene reload, corrected supplier number and application-error assertions remain intact. This is an incorrect expected value, not evidence of a timing failure. The reported 32.430 seconds includes both attempts and an 18.288-second first app startup. A server-close warning followed the assertion failures and does not explain the filename mismatch. No deadline, retry, quarantine or production filename behavior changes. Browser execution remains with CI, so the later workflow assertions are not established by this failed run.


### Purchase reload fixture correction

The next 16 November PR #1560 Linux Check reached the CSV content assertions, then failed both attempts waiting for a `save-scene` POST. The two attempts took 40.414 seconds together. The aggregate Check failed only because e2e-changed failed. All three required jobs passed. The server-close warning followed the assertion failure.

`__studio.load` changes the scene id and establishes the autosave baseline. Listing and owned-stock controls save to the separate purchase store, so this workflow creates no subsequent scene edit to trigger autosave. The walkthrough now restores its explicitly identified scene fixture through the scene-read routes and reloads the page. It retains the exact CSV comparison after purchase-store reload, packaging correction, real download checks and empty application-error assertion. The unrelated scene-write poll is removed. `e2e/firstLaunch.e2e.test.ts` retains actual scene autosave and relaunch coverage, while `electron/backend/purchases.test.mjs` retains purchase disk reload coverage. No timeout, retry or quarantine changes. Browser execution remains with CI.


### Covered help verification

The eight preflight notices were checked against the complete supplier-handoff diff. Each article retains its steps, labels and referenced screenshot states:

- `add-parts-from-the-catalog.md`: `components.ts` adds optional supplier types to component and variant interfaces. Catalog entries, tiles, search, sizing and placement controls are unchanged.
- `count-the-parts-you-already-own.md`: `bom.ts` adds `lineIdentity` to each projected line. Owned splitting, prices, stock controls and cross-scene purchase storage are unchanged.
- `from-design-to-build.md`: that same identity projection leaves BOM demand, purchase totals, manufacturing groups and readiness findings unchanged. The new export task is covered by `export-remaining-purchases.md`.
- `joints-and-kinematics.md`: `robotics.ts` adds optional identity to `PurchaseRecord`, with no joint, kinematic, pose or actuator contract changes.
- `parts-assemblies-and-mounting-ports.md`: the catalog guide adds purchasing provenance rules, component interfaces gain optional metadata and BOM lines project identity. Product geometry, Inspector Product facts, part kinds, assemblies and port behavior are unchanged.
- `the-design-agent.md`: the agent guide documents optional supplier fields on the existing sourced-item tool. Catalog sourcing, scene edits, Checks, priorities, controls and agent limits are unchanged.
- `troubleshoot-build-real-parts-check.md`: `sourcedItems.ts` gains optional supplier metadata and BOM projection gains identity. Source confirmation, placeholders, price controls and readiness messages are unchanged.
- `weight-and-center-of-mass.md`: `supplies.ts` adds optional purchasing identity to its interface. Supply records, masses, density fallbacks, body fitting and stability calculations are unchanged.

These are coverage-overlap notices, not stale help instructions. The articles remain unchanged under preflight's stated exception. No screenshot state needs replacement for these metadata additions.

### Ordering conversion editing

Review found that the Units per order input converted its value on every keystroke. Typing `1.0` erased the decimal point after `1` and then produced `10`. Typing `0.5` could erase both the zero and point before retaining `5`. Either sequence could change Supplier Order Qty in the exported file.

The form now retains conversion drafts as text and converts them only when building the saved purchase. Eight purchase-form cases cover `1.0`, `1.5`, `0.5`, cleared and zero drafts, a negative value, infinity and nonnumeric text. The existing browser workflow types `1.0` sequentially and retains its exact expected CSV quantities, purchase reload and packaging correction. Browser execution remains with Linux and Windows CI. No deadline, retry or existing assertion changes.

The review's named seven-file `check:changed` run passed formatting, lint, documentation, types, all 304 site pages and 41 related tests across nine files. The related tests took 428 ms. `git diff --check` also passed. These checks do not execute the browser workflow.

## Electrical projection

The electrical projection, Checks integration and Schematic export share one worker-owned derivation. Ten generated fixtures include ordinary component dimensions, mechanical links and joints: tethered SO-101, battery rover, quadruped, hexapod, pan-tilt camera, gripper, mixed-voltage robot, dual-bus arm, sensor-rich inspection robot and fixed appliance. Unsupported sensors, variants, host connections, loads and source declarations remain requirements. All ten packages are incomplete drafts. None establishes hardware readiness.

Manufacturer evidence inspected on 16 November 2026:

- [Feetech C001 specification, table 6-7](https://www.feetechrc.com/Data/feetechrc/upload/file/20260622/6391772523943436695270694.pdf) numbers GND, Vcc and TTL as 1, 2 and 3.
- [Waveshare adapter schematic, H3/H5 and DC1](https://files.waveshare.com/wiki/Bus_Servo_Adapter_A/Bus_Servo_Adapter_A.pdf) numbers DATA, DC_IN0 and GND as 1, 2 and 3. DC1 uses terminal 1 for positive and 2/3 for ground.
- [ROBOTIS XL330-M288](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/) and [U2D2](https://emanual.robotis.com/docs/en/parts/interface/u2d2/) identify TTL GND, VDD and DATA as 1, 2 and 3.
- [Pololu D36V50F6](https://www.pololu.com/product/4092) describes labeled VIN, VOUT and GND pads. The family shares these interface labels, with different output ratings.
- [MEAN WELL GST60A specification, pages 2–3](https://www.meanwell.com/Upload/PDF/GST60A/GST60A-SPEC.PDF) identifies GST60A05-P1J as 5 V, 6 A, ±5%, center positive. DC return is isolated from AC frame ground.
- [Littelfuse FHA specification](https://www.littelfuse.com/~/media/commercial-vehicle/datasheets/automotive-fuse-holders/ato/littelfuse-fuse-holders-ato-fha-datasheet.pdf) identifies 0FHA0001ZXJ as a bare standard-duty holder with two unpolarized leads, rated up to 20 A and 32 V. A/B are schematic lead designations. No fuse rating is inferred.
- [C&K 7000 specification, pages 1–3](https://www.ckswitches.com/media/1394/7000toggle.pdf) identifies 7103 terminal 2 as common and its ON path as 2-to-3. Q contacts are rated 5 A at 28 VDC. Terminal 1 remains explicitly unused.

`tools/electrical/expected.ts` independently declares connector pin groups and expected servo rails without importing production pin maps or topology. `check.mjs --docker` uses Linux KiCad CLI 9.0.6, requires zero ERC violations and compares XML netlists for all ten fixtures. Removing a ground label must fail ERC. Shorting positive to ground must fail independent netlist comparison. Pin-map and supply perturbations must also produce requirements. Unknown interfaces are absent from verified pin groups and remain draft findings. A clean ERC checks only the represented software model.

The first serializer marked symbols off-board, which caused KiCad to omit all components and nets. Symbols now remain in netlist export while staying out of its BOM. Fuse and switch input/output paths remain separate nets. Grounds bypass those positive-path modules. Shared bus rails retain every bus identity and individual interface rating. No power flag, blanket suppression or invented circuit conceals missing information.

Focused tests cover reversed polarity, conflicting supplies, missing ground, unknown maps, overloaded declared rails, repeated modules, duplicate names, missing source evidence, malformed declarations, fresh walking estimates, immutable input data, canonical hashing and real scene-file save/reopen byte equality. Stale-scene tests reject parts, supplies and scene identity changes and cancellation. The browser acceptance file uses ordinary desktop and web export controls, edits Supply voltage before export and verifies the changed finding, ZIP, references and SHA-256 fingerprint. Browser acceptance runs in CI. A production documentation walkthrough locally exercised the same desktop controls, downloaded small and repeated-module packages and captured the two help states without app errors.

The path-scoped Electrical export workflow configures Linux Docker validation and Windows export/path determinism. Windows execution is CI evidence, not a local observation. No full-suite validator, timeout increase, retry or quarantine was added.

The final changed-file check passed formatting, lint, documentation, types, site copy for 301 pages and 2,511 related tests across 387 passing files. One existing file and test remained skipped. Its 388-file selection took 100.83 seconds because the shared power helper reaches many existing consumers. An earlier 14-file electrical check passed 94 tests. Earlier related-run failures remain historical evidence in `scratch/electrical/final-check.log`, superseded by `final-all-changed-check.log`. The production capture passed but its unused web development servers reported a shutdown warning after the existing teardown deadline. No timeout or retry changed. Final CLI reports, measurements and captures remain under `scratch/electrical/`. The small existing help contraction correction permits the site checker to validate the new pages.

### Electrical help coverage review

The preflight coverage prompts were checked against the actual menu, command conditions, export callbacks and readiness aggregation. The new electrical findings join the existing verdict rather than replacing it. No existing export or import route changed.

| Article | Result |
| --- | --- |
| Checks and blockers | The verdict, ignore actions, background execution and limits still hold. The schematic article now contributes its electrical summary through the existing hub fields, without editing the hub. |
| Export a robot package | Export ▸ Robot Package, its rig condition, progress, filename and ROS files still hold. The menu and completion images illustrate those unchanged controls. |
| Export a STEP file | Desktop availability, Export ▸ STEP, Export STEP in the command palette and saving behavior are unchanged. Both illustrated controls remain available. |
| Export an STL file | Export ▸ STL, the nonempty-scene condition, binary mesh producer and filename remain unchanged. The menu image still shows the target control. |
| Export plates as 3MF | Export ▸ 3MF Plates, material filenames, plate writer and web availability are unchanged. Its menu image still shows 3MF Plates below STL. |
| The path from design to build | Added the electrical blockers and schematic handoff beside the existing cable and BOM explanation. Cable quantities and Build Along behavior remain unchanged. |
| Get a robot ready to build | Added the electrical failure action and selected-product rating limit. Replaced the historical all-checks-passed illustration with the captured conflicting-supply state. Supply, payload, Cases and ignore instructions remain unchanged. |
| Import a file | Import routing, file formats, dialogs and illustrated SVG controls are unchanged. The command list only gains a separate export. |
| Open a shared scene | Open Scene File still invokes the same scene opener. Scene copying, tab behavior and supported entry points are unchanged. |
| Parts, assemblies and mounting ports | Catalog geometry, mounting and connector-port contracts are unchanged. The electrical maps are separate evidence, so none of its placement or cable instructions needs rewriting. |
| Set a time budget | The same Time inputs, thresholds and estimates feed readiness. Electrical findings append independent rows. Its estimate, over-budget and within-budget states remain valid. |
| Share a scene | Export ▸ Scene, Export Scene and the shared-scene encoder are unchanged. The existing menu image still shows Scene. |

No unchanged article was edited merely to clear a coverage prompt. Existing menu images identify the same target commands despite the added Schematic item. The new electrical state reuses the production capture linked by the schematic task. Documentation-only correction checks and current copy accounting are retained in `scratch/electrical/help-preflight-check.log` and `help-preflight-copy.txt`.
