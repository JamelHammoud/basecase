# Cable routing performance

Implementation: [Cable routing](../guide/build.md#performance-cable-routing). Shared requirements: [Performance](../guide/performance.md).

## Containment queries prepare one endpoint

The app-wide search for `crossesBox` and clearance `crosses` calls found identical-endpoint queries in ordered-stop validation and detour-corner rejection. Both bus and power routes reach them through `routePath`. Uncached containment now transforms the point and evaluates its relative motion bound once. Cached containment avoids a second prepared-point lookup. Ordinary segments keep independent endpoint preparation.

The rotated-obstacle matrix in `routeClearance.test.ts` uses seven local x coordinates and two motion owners. Its 14 identical-endpoint queries match the results of distinct endpoint objects with the same data. Spies verify one transform and one bound evaluation per uncached query, compared with two each in the preceding implementation. This reduces those totals from 28 to 14. Cached queries retain one transform and bound evaluation on first use, while removing the second cache lookup. These are operation counts, without timing assertions or a claim about complete routing latency.

The matrix covers interior, exterior and boundary points and preserves its inputs. It also checks different owners at identical coordinates against independent preparation, retaining different endpoint envelopes. Existing tests cover shrinking envelopes, nested bound queries, oriented visibility graphs, anchors, edits, undo and complete deterministic routes. No test deadline, retry or quarantine changes. No action, label or visible state changes, so the cable-routing help steps and screenshots remain accurate.

## Connector exits accumulate the nearest housing boundary

The whole-app search for `ownerExitDistance` and local boundary distances found one housing-exit implementation. Both bus and power routes reach it through `routePath`. It retains the nearest boundary in axis order instead of building a flattened distance list from three axis-result lists. The outside-housing fast path still returns before this scan.

Each endpoint that reaches the boundary scan previously constructed four temporary arrays. The replacement constructs none for this scan, removing eight arrays when both endpoints need it. Local-coordinate transforms and endpoint coordinate arrays remain. These are source-derived allocation counts, not timings or a claim about complete routing latency.

A local scratch comparison matched complete polylines and refusals against the preceding implementation for 240 routes. It varied five housing sizes, eight axis directions including near-parallel components, three local rotations and a neighbouring blocker. Every input stayed unchanged. Existing `routeGeometry.test.ts` retains extended and rotated housing exits, mandatory-exit obstructions, anchors and deterministic detours. No new test, timeout, retry or quarantine was needed.

This changes no action, label or visible state. The cable-routing help steps and screenshots remain accurate.

## Detour labels share one match buffer

The whole-app search found one `routeTopology` implementation and one production caller in `routeAnalysis.ts`. Both bus and power routes use it for every sampled pose. The matcher now visits interior points directly and retains one label buffer per query. Sorting, duplicate labels, matching tolerance, point order and corner preparation remain unchanged.

For N interior points, the preceding implementation created one point slice, N filtered corner lists, N mapped label lists and N flat-map result lists. The replacement uses one reusable label list and the final output list. For 300 and 600 interior points, that removes 900 and 1,800 temporary arrays, respectively. These are code-derived allocation counts, not timings or a claim about complete wiring-analysis latency. Corner records and sorting work remain.

`routeTopology.test.ts` compares complete output against the preceding implementation across 768 interior points, ordinary and rotated obstacles, axis and diagonal tolerance boundaries, NaN and infinity. Its repeated-corner case places an unmatched point between matches and preserves duplicate labels. Existing tests cover direct-route laziness, later obstacle edits and source preservation.

No action, label or visible state changes. The cable-routing help steps and screenshot remain accurate.

## Joint sampling gaps accumulate directly

The whole-app search for `routeMotion`, `halves` and adjacent sample-gap calculations found one routing half-gap constructor. Every bus and power route uses its per-joint values through `relativeMotionBound`. Other sample-gap lists, such as bench-log timestamps, serve different calculations.

For a nonempty list of N samples, the previous constructor copied N−1 sample entries and built N−1 half-gap entries before spreading them into `Math.max`. The direct scan retains one scalar and applies the same subtraction, division and maximum in source order. Empty and singleton lists still yield zero. Sampling, joint iteration, Cartesian pose limits and failure messages are unchanged. These are code-derived allocation counts, without timing assertions or a claim about complete routing latency.

`routeMotion.test.ts` checks ten range cases, including reversed and collapsed ranges, off-grid endpoints, nonfinite inputs and both sides of the 61,440-degree sampling guard. Each case also checks unchanged source scenes and independent results after a range edit. Existing motion tests retain nested revolute and prismatic clearance bounds. Routing analysis and bound tests cover bus and power consumers. No timeout, retry or quarantine changes apply.

This changes no action, label or visible state. Existing cable-routing help steps and captures remain accurate.

Targeted validation passed formatting, lint, types, documentation, site copy for 291 pages and 332 tests across 54 related files. Copy diff is net zero. Preflight flagged [Servo bus or Cable reach is red](../../site/content/help/troubleshoot-servo-bus.md). Its endpoint selection, cable measurements, routing refusals, stock lengths and expanded-check screenshot were checked against the final code and remain accurate, so the article stays unchanged.

## Saved routing choices are indexed once

`routeSpecs.test.ts` compares complete routed netlists against per-net selection using the previous four-field matching rule. Its 24 nets span bus and power routes, with ordered anchors, passing stock and unavailable stock. Reversed choices precede matching choices, and later duplicate choices carry different stock and anchors. The test checks source preservation and a new analysis after inserting an overriding choice. Additional cases check separator collisions, missing endpoints and absent choices. Existing routing tests retain motion, clearance and refusal coverage.

A local scratch comparison used 300 and 600 saved choices, queried once each by a matching net and once each by an unmatched net. Counting reads of each saved choice's source endpoint through an accessor measured 135,450 reads before and 600 after for 600 nets, and 540,900 before and 1,200 after for 1,200 nets. Every lookup returned the same record as the previous linear search. These are operation counts, without timing assertions or a claim about complete wiring latency. The index adds storage proportional to the number of saved choices and serializes one four-field key per choice and queried net. Projects without saved choices skip both storage and key serialization.

## Cable measurements use scalar distances

`routeMeasure.test.ts` compares complete routed netlists on 24 scenes against the previous vector-based distance and path-length implementations. The fixtures vary placement, stationary and moving joints, direct and bracket-detoured paths, and passing and too-short stock choices. Inputs remain unchanged. Numeric comparisons include empty and singleton paths, signed zero, small coordinates, stock-length boundaries, overflow, infinity and NaN. `routeAnalysis.test.ts` retains power-lead, anchor, coupled-motion and refusal coverage.

The existing 300- and 600-point motion-bound fixtures now assert 1,202 and 2,402 scalar distance calls and zero vector distance calls. The preceding implementation used two new vectors per distance call, so those queries avoid 2,404 and 4,804 vector constructions. Each sampled path also avoids two vectors per segment and one copied segment list. These are source-level allocation counts checked through distance-call spies, without timing assertions or a claim about complete routing latency. Visibility-search distances keep their existing `Math.hypot` arithmetic, since replacing either metric with the other can change floating-point results.

## Servo buses group connectors once

`netlistGrouping.test.ts` checks mixed connector ordering, ordered adapter splits, duplicate actuator references, loose servos, surplus and missing adapters, empty scenes and unchanged inputs. Existing netlist tests cover cable quantities, power feeds, engineering findings and BOM output.

A scratch comparison matched complete netlists against the previous implementation on 250 generated scenes. Fixtures varied zero to 24 Feetech servos, half as many DYNAMIXEL servos, zero to four alternating adapters, omitted joint references and reversed joint order. On a separate 600-servo, eight-adapter fixture with both connector types, exported `busIn` calls fell from 3,008 to 1,808 and exported `portOf` calls from 628 to 620. These spy counts exclude calls internal to the connectors module. Connector classification now takes one pass over each list rather than one servo pass plus another per connector and one adapter pass per connector. Counts are local operation measurements, without timing assertions or a claim about total routing latency. The comparison does not exercise arbitrary sourced connector types.

## Cable-clearance queries reuse their interval

`routeCollision.test.ts` checks all axes, parallel epsilon thresholds, grazing contact, disjoint axis intervals, growing and shrinking envelopes, nested queries and unchanged inputs. Existing routing tests cover rotated housings, thin obstructions, coupled joints and deterministic detours. A seeded scratch comparison matched the previous result on 50,049 queries, including rotated boxes and displacement envelopes. Those queries created 193,734 interval arrays before and 50,049 after. These are source-level allocation counts, without a claim about garbage collection or end-to-end routing time.

## Cable motion bounds retain chain geometry across probes

`routeBound.test.ts` compares 12,000 complete bounds across mixed chains, shared ancestors, reversed queries and unowned solids, plus edits, missing ranges, nonfinite inputs and source preservation. It also compares complete netlists against the previous bound on twelve scenes and a later placement edit. Its 300- and 600-point fixtures reduce sine calls from 1,500 and 3,000 to eight, and distance calculations from 3,300 and 6,600 to 1,202 and 2,402. These are operation counts without timing assertions or a claim about complete wiring time.

## Cable detours share local point coordinates

`routeClearance.test.ts` checks oriented obstacles, duplicate obstacle ids, growing and shrinking envelopes, epsilon boundaries, lazy preparation, anchored detours, edits and source preservation. A scratch comparison matched 300 seeded routes against the previous implementation. On an anchored route around four boxes, coordinate transforms fell from 1,450 to 236. This is an operation count, without a timing assertion or a claim about total wiring latency.


## Detour labels reject distant corners

The whole-app search for `routeTopology` and its corner-distance predicate found one shared matcher, consumed by `routeAnalysis.ts` for bus and power routes. It rejects a corner when any coordinate gap reaches the existing 1e-9 mm tolerance. The remaining candidates retain the original strict `Math.hypot` distance comparison, including diagonal rejection. Corner construction, label sorting, duplicate labels and interior-point order are unchanged.

`routeTopology.test.ts` compares complete topology output with the preceding implementation across 768 interior points around ordinary, duplicate and rotated obstacle corners. Offsets cover all axes and diagonals below, at and above tolerance, plus NaN and infinity. It also checks obstacle-order independence and source preservation. Existing tests retain direct-route laziness, obstacle edits and complete detour routing.

The test's 300- and 600-obstacle fixtures each have one matching interior point. Spying on `Math.hypot` measures 2,400 and 4,800 calls before, respectively, and one after in each fixture. These are local operation counts, without timing assertions or a claim about complete routing latency. The comparison still scans all corners and adds up to three scalar coordinate checks per candidate.

No action, label or visible state changes. The existing cable-routing help steps and capture remain accurate.

## Resistive motor-current replay

Implementation: [Build](../guide/build.md#resistive-motor-current-replay). Numerical preparation, solving, hashing and retained-record verification run in the existing electrical worker. The tree solver uses a breadth-first edge ordering and one reverse current pass and forward voltage pass per sample. It does not allocate a dense matrix. Storage grows with samples times loads and segments, within 64 loads, 128 paired segments and 4,096 windows. The independent 4 MiB retained-record cap can refuse a network inside those individual axis limits.

Local observations on 20 November 2026 used Node 26.13.0 on an arm64 Apple M5 Pro with 18 logical CPUs. The scratch workload bundled the production `electrical.worker.ts` as an IIFE, hosted its ordinary message protocol in a Node worker thread, and timed message delivery through its response. This is a numerical worker-host observation, not browser-worker or CI latency. The generated load windows came from the real `TorqueRecorder` and current model. All resistances were explicit generated controls. Preparing 4,096 current windows for 32 motors through the production recorder and retained-trace producer took 46.407 ms. Together with 32 prescribed adapter loads, this reached the 64-load limit. No electrical hardware was used.

| Workload | Preparation | Solve | Worker round trip | Retained bytes | Worker heap observation |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 motors and 1 adapter, 9 windows | 0.430 ms | 0.078 ms | 8.207 ms | 15,580 | 17,718,928 bytes |
| 64 loads, 128 segments, 4,096 windows | 30.450 ms | 87.282 ms | 27.379 ms to refuse retention | Refused above 4 MiB | 29,599,224 bytes |

The maximum-axis trace serialized to 2,567,667 bytes. Its unrestricted pure-solver result serialized to 26,511,336 bytes. The production retention call refused its input before constructing that oversized retained result. Pure preparation and solving were measured separately to establish numerical cost at the axis limits. The figures do not claim that all axis maxima fit the storage cap. Worker startup took 83.351 ms and is outside the round-trip column. Heap observations are process-reported used heap after a reply, without forced collection, rather than isolated peak allocation.

After posting another maximum-axis request to the same ready worker, termination completed in 2.648 ms including message submission. This establishes termination of that scratch worker host. The fast delivery test checks disposal of the production client and refusal of renderer fallback. Browser cancellation and late-result suppression are separate delivery observations. Concurrent repository workloads produced substantial timing variation across exploratory observations. This table retains the last observation against the final numerical inputs and establishes neither a rate nor a performance improvement. No timeout, retry, merge gate or shared performance policy changed.



The fast matrix uses the production `TorqueRecorder`, `jointAmpModel`, retained trace producer, electrical projection and paired-tree solver. Generated robot scenes cover single-servo and daisy-chained arms, pan-tilt, gripper, star quadruped wiring, a shared-trunk hexapod, unequal rover branches, two STS buses on one source, repeated leg modules and an asymmetric payload arm. Current windows include simultaneous and staggered prescribed force peaks. These are generated model inputs, not measured motor currents or a physical electrical validation. The two-bus case mixes arm and other joint roles on supported C001 interfaces, without claiming mixed-protocol controller support.

Independent checks use 12 decimal places for analytical series and branched voltage drops, 11 for Kirchhoff current conservation and 10 for source-to-load power balance. Subdividing a segment preserves endpoint voltage to 12 decimal places. Controls include explicit ideal sources and conductors, shared return removal, changed resistance against a frozen trace, nonpositive voltage and source-current domain limits. Negative, nonfinite and mismatched sample windows, missing model coefficients, missing resistance or evidence, absent loads, changed actuator identities, multi-actuator allocation, disconnected loads, cycles, regulators and multiple-source inputs are refused. None becomes an inferred zero load or resistance.

`powerReplayDelivery.test.ts` uses actual `.basecase` bytes and canonical fingerprints to check deterministic reopening, source voltage, electrical part placement, cable declarations, trace values and model coefficient edits. Altered saved results are refused. It also checks the 4 MiB cap and client disposal with renderer fallback disabled. Default electrical pin maps are retained with their source evidence, so later map changes affect applicability rather than silently changing historical derivation. Removing documented ground pins from scene-part endpoints is refused. Virtual fuse and switch nodes retain their explicitly declared ideal return bypass. The negative control reproduced acceptance of missing return pins before the admission check was tightened.

The focused changed-file selection passed 17 files and 90 tests in 5.26 seconds before the final pin-map provenance assertion and current-variation assertion were added. Formatting, lint and TypeScript checks passed for that selection. Site checks still required the documented screenshot files at that observation. The earlier broad related selection passed 445 files and hit deadlines in nine existing files, with 15 failed tests and 20 skipped. The failures were existing Case, drive, Kit, league replay and parameter-regeneration workloads at their unchanged 5-second tests or 10-second setup deadline. No assertion, timeout or quarantine was changed. These local results do not establish Linux or Windows delivery.

`e2e/powerReplay.e2e.test.ts` declares the ordinary palette Import boundary, Build inspection, resistance entry, lowest-voltage selection, exact retained sample time, same-trace comparison, scene-byte reopening and invalidation after Add Point in the cable editor. It asserts unchanged Electrical connections authority and no robot command posts. File selection uses the existing `pickFiles` fixture boundary, followed by the real Import command and scene decoder. Linux and Windows execution remains with CI.

The final-source help capture passed the ordinary Import and Build flow on 20 November in 47.53 seconds, within the existing 180-second browser deadline. It used an unminified web bundle prepared for article capture. It typed the source resistance character by character and entered every outgoing conductor, return conductor and remaining-load declaration through controls, selected `motor2` at 0 seconds, and compared 0.02 Ω and 0.04 Ω source resistance against the same trace fingerprint. Closing and reopening inspection reproduced the evidence. Adding a cable routing point preserved that fingerprint as historical evidence and disabled comparison. Electrical connections stayed failed, robot command posts stayed empty and no page errors were recorded. All four article images were written through `captureArticle`, including its startup and image checks. These observations establish browser model delivery on this Mac, without physical electrical validation.

The capture exposed a duplicate Cancel action and a cable-field locator that searched for a nested dialog. The sheet now uses the shared Modal footer, and the browser declaration targets the cable row directly. Limiting-part and time assertions read the actual inspection selection rather than only the saved minimum. Both browser declarations explicitly set zero retries and retain the existing deadlines. The help coverage review below records each article against the additive replay changes. The dedicated replay task carries its controls and captures.

One intervening capture hit the unchanged 180-second deadline. Stage instrumentation then passed the same minified bundle in 45.84 seconds. The final capture refreshed the worker admission change and all four images. The local four-worker aggregate check also hit existing Case, native replay, Kit setup and parameter-regeneration deadlines while a help bundle overlapped it, and was stopped after those failures and subsequent input corrections. The final 41-file changed check ran without an overlapping bundle or capture and passed formatting, lint, types, documentation and all 356 site pages. Its related selection passed 471 files and 3,775 tests, with one existing skipped declaration. It selected 472 of 1,734 files and took 195.13 seconds in the test phase using the existing local four-worker invocation limit. No existing skip changed. These observations establish neither a pass rate nor a browser latency improvement.

The launch does not change existing electrical, board, cable-editor or native-diagnostic quarantines, repair ownership or restoration requirements. Numerical and worker-host measurements are in [Cable routing performance](performance-wiring.md#resistive-motor-current-replay).


### Replay help coverage review

The Build overview and readiness task now link the electrical inspection to the replay task and retain Checks authority. The replay article supplies its design-agent hub summary through feature metadata. The hub file stays unchanged, as required by the help hub contract. Existing screenshots still depict their named states. Replay adds a control within Electrical connections and a separate sheet, without changing the other pictured controls or findings. The four replay captures document the new sheet.

| Article | Code comparison and disposition |
| --- | --- |
| [Buy the parts for a robot](../../site/content/help/buy-the-parts-for-a-robot.md) | `buildCommands.tsx` adds Inspect Current to its command list. Buy All, supplies, store links and BOM exports retain their handlers and labels. The BOM menu capture remains applicable. The article is unchanged. |
| [Check printed parts are strong enough](../../site/content/help/check-printed-parts-are-strong-enough.md) | `CheckItem.tsx` adds inspection only for Electrical connections. Its stress overlay, Strength rows and Fix behavior are unchanged. `FindingRow.tsx` only adds an optional context callback. Both Strength captures remain applicable. The article is unchanged. |
| [Count the parts you already own](../../site/content/help/count-the-parts-you-already-own.md) | `BuildPanel.tsx` mounts the replay sheet separately and passes its callback to Checks. BuyList, purchase persistence, on-hand editing and totals are unchanged. Both inventory captures remain applicable. The article is unchanged. |
| [The path from design to build](../../site/content/help/from-design-to-build.md) | Added the replay task beside Electrical connections, with its frozen-trace comparison and unresolved electrical requirements. Existing readiness and manufacturing descriptions remain accurate. |
| [Get a robot ready to build](../../site/content/help/get-a-robot-ready-to-build.md) | Added Inspect Current and its task link beside the electrical findings. Existing Fix, selection, voltage, supply current, Payload, Cases and Ignore actions are unchanged. Existing captures retain their named findings and controls. |
| [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) | `robotics.ts` adds only optional retained replay evidence to ProjectSettings. Joint fields, pose behavior, hierarchy, IK, tendons and imports are unchanged. The article contains no screenshots. The article is unchanged. |
| [Make a build guide](../../site/content/help/make-a-build-guide.md) | The added palette command does not change guide generation, viewing, export, updating or settings handlers. Current and Out of date guide captures remain applicable. The article is unchanged. |
| [Point the agent at a part](../../site/content/help/point-the-agent-at-a-part.md) | The new optional FindingContext callback changes no quoting, annotation, Fix or Edit Route behavior. Replay does not submit an agent request. The article contains no screenshots. The article is unchanged. |
| [The design agent](../../site/content/help/the-design-agent.md) | The guide addition documents retained current windows from peak verification. Existing agent capabilities, priorities and user controls remain accurate. The replay article's `hub_the_design_agent` field supplies the feature summary through the existing hub. The hub file is unchanged. |
| [A check blocks Ready to build](../../site/content/help/troubleshoot-build-check-blocks-ready-to-build.md) | The context type extension changes no blocker selection, repair, Ignore, Restore or verdict behavior. Replay cannot clear a blocker, so the existing troubleshooting steps remain applicable. Its feature summary appears in the separate Checks and blockers hub through `hub_checks_and_blockers`, not in this troubleshooting hub. The article contains no screenshots. The hub file is unchanged. |

These eight unchanged article notices are coverage review reminders, not unresolved behavior or missing captures. Their covered code remains relevant, so their `covers` entries stay intact.


### Electrical fixture bundle assets

Pull request #1973's supplied Check logs show the Linux and Windows electrical jobs failing during Rolldown bundling, before any KiCad acceptance runs. Both errors identify Draco's decoder WASM and wrapper JavaScript imports with Vite's `?url` suffix. Linux treated the suffix as a missing filename. Windows rejected it as filename syntax. The aggregate Check failed because the electrical matrix failed, while the required, changed-browser, ROS and copy jobs passed.

The import path is electrical fixtures, electrical package, board package, board preparation, component meshes, geometry worker, geometry operations, robot mesh importer and Draco. The acceptance bundler previously handled only Manifold's asset import. Both schematic and routing acceptance now share a Node fixture bundler that resolves URL imports to actual file URLs. Manifold keeps its existing empty-URL override for its Node loader. Application Draco loading, native validators, assertions, deadlines and selection remain unchanged.

`fixtureBundle.test.mjs` compiles and imports the production schematic and routing fixture entry points without native tools. It covers the complete current dependency graphs and their URL imports. It does not claim Draco decoding, physical electrical validation or a completed Linux or Windows native acceptance run. CI owns those native runs.


### Replay review corrections

The next supplied Check log passed retained reopening and historical evidence but failed the keyboard assertion in the first replay declaration. The raw `data-replay-time` was `0.026000000000000002`, while the assertion expected the display string `0.026`. The captured window accumulates thirteen 0.002-second steps. The browser assertion now checks index 1 and exact equality with the fixture's captured window. The separate visible `0.026 s` assertion remains. No rounding, tolerance, timeout or retry was added. The aggregate Check failed solely because changed-browser execution failed, with required, electrical, ROS and copy jobs successful. Browser verification of this correction remains with CI.

The subsequent Check failed both replay browser declarations at `enterReplayResistance`, waiting 30 seconds for the original motor1-to-motor2 display name. The imported fixture had renamed motor2 to exercise long cable labels after constructing its cable list. The rendered row therefore used the new name while the helper searched the old one. Resistance entry now selects the existing cable identity attribute, which excludes scene-part display names. Both declarations retain their replay, comparison, historical evidence and confirmed-deletion assertions. No timeout, retry or assertion changed. The aggregate Check reported the same changed-browser failure, with the required, electrical, ROS and copy jobs successful. Local browser execution remains excluded from this revision. CI must verify the repaired walkthroughs.

A focused negative control removed only the Waveshare adapter's documented common ground from its pin map. Replay still admitted the network, collapsing its power and bus ports into one node without an established return between them. Admission now requires common positive and ground rails for multiport scene parts as well as actuators. `powerReplayDelivery.test.ts` covers removal of either adapter rail. This establishes refusal of unsupported model topology, without validating physical wiring.

The containing Build screen put optional Inspect Current above electrical findings and repair controls. It now follows them. Historical evidence also disabled all replay inputs without a way to start over. The sheet's confirmed Delete clears both retained runs, and its own error boundary isolates render failures. The Time slider supplies keyboard access to every sample and replaces one-decimal rounding that displayed a 26 ms sample as 0.0 s. Cable selection controls wrap long endpoint names before the current and loss figures.

Reopening now verifies that a comparison shares the baseline's source and trace fingerprints. A fast negative control builds two independently valid records from different traces and checks that they cannot be presented as one comparison.

The two existing replay browser declarations now cover minimum-width action order, measured label and input bounds, wrapped cable text, keyboard selection of the 26 ms window, cancelled deletion preserving evidence, confirmed deletion and replay after a routing edit. Assertions use the real Import and Build controls. Browser execution remains with CI. Existing article images still illustrate their named baseline, comparison and historical states.

The review's final 17-file changed check passed formatting, lint, types, documentation, all 360 site pages and 84 related tests across 17 files. The test phase took 3.41 seconds locally. No browser walkthrough ran in this review.

### Replay scene ownership and voltage labels

The next review traced `Studio.TabWorkspace`: inactive scene workspaces remain mounted, and the replay Modal portals to `document.body`. The global boolean replay flag therefore opened sheets in every mounted Build panel, beyond the inactive workspace's inert DOM subtree. The flag now identifies its owning scene. Inactive scenes cannot render replay, and switching away clears the owning scene's open request and disposes its worker.

The existing first replay browser declaration now mounts a second Build workspace before opening inspection and asserts exactly one replay sheet. It then switches away and back while inspection is open and requires the sheet to remain dismissed. A further resistance comparison crosses the voltage model boundary and checks its alert and that both the comparison and selected-sample labels use the true minus sign. The production shared formatter also removes a negative sign when the displayed value rounds to zero. Loading and replay use a spinner with an accessible busy state. Errors and model-limit alerts use the specified error tone. These assertions are declared for CI, without local browser execution, new retries or changed deadlines.

The final eleven-file changed check passed formatting, lint, documentation, TypeScript, all 364 site pages and 21 related tests across nine files. The related test phase took 968 ms. Its log is `scratch/review-1973-verified.log`. No browser walkthrough ran locally.

## BOM cable stock

The duplicate cable browser test was removed after taking 45 s and failing in run 43721538732. It searched for the provisional Bus Servo Cable row, which measured stock replaces. The previous green run 43715791435 passed it only on retry on both Linux and Windows.

## Editable cable route work

The editor changes the existing project.wiring records. Acceptance uses production netlist, analysis, BOM, scene-file, history, version-reference and manufacturing archive paths. No routing bound, timeout, retry or quarantine is changed.

### Generated designs and numerical contracts

`wiring/cableEditingMatrix.test.ts` covers ten generated designs with explicit stock, exact required lengths, full limiting-pose values, unchanged connector identities and quantities. One pass isolates stock and declared-motion propagation without obstacle inputs. A second pass sends every design through the analysis worker with transformed, nonuniformly scaled generated solid meshes and compares the full result against explicit world bounds. Separate ring and owner-mesh tests below cover the critical clearance cases. These checks do not establish whole-robot readiness.

| Design | Required length | Limiting joint values |
| --- | --- | --- |
| Two-servo arm | 243 mm | Shoulder 0°, wrist 15° |
| Wrist-camera arm | 243 mm | Shoulder 0°, wrist 15° |
| Differential rover | 229 mm | Left -15°, right 15° |
| Quadruped | Unresolved | All zero, retained coverage-limit refusal |
| Hexapod | Unresolved | All zero, retained coverage-limit refusal |
| Pan-tilt camera | 243 mm | Pan 0°, tilt 15° |
| Sliding mechanism | 249 mm | -20 mm |
| Two-adapter servo chain | 243 mm | 0°, 15°, 15°, 15° |
| Mixed servo buses | 243 mm | Serial joints 0° and 15°, second bus 15° |
| Enclosure with lid-mounted servo | 295 mm | Lid 90° |

Each resolved edited route selects one 900 mm cable and contributes one piece and one purchase pack. Other route stocks are pinned independently, so automatic choices cannot obscure the expected selected-stock quantity. The quadruped and hexapod retain Range coverage exceeds routing limit rather than reducing their motion samples.

`wiring/cableCoupledEditing.test.ts` moves an anchor on the downstream wrist link while both joints move. Its retained requirement is 417 mm at shoulder -15° and wrist -15°. Independent planar trigonometry evaluates 961 simultaneous poses at one-degree intervals and checks the conservative requirement covers their complete polyline lengths, bend allowances and slack. A selected 300 mm cable fails. Modeled rest points remain unchanged.

### Geometry and refusal cases

`wiring/routeEditingAcceptance.test.ts` repairs a changing detour topology with one adapter-owned point at [30, 40, 160] mm. The requirement is 486 mm at elbow -90°. Selecting 300 mm stock retains that requirement and pose while failing. The same suite keeps blocked exits, missing anchor owners and unsupported loop closures unresolved. `routeEditing.test.ts` refuses incompatible stock, virtual endpoints, stale net identities and nonfinite points. It also checks repeated-part isolation and imported endpoint property order.

`three/analysis/cableOpening.test.ts` passes a real four-bar ring mesh through the existing worker pipeline. A ray passes through its opening while whole-solid conservative bounds still refuse the connector exit.

`three/analysis/cableOwnerGeometry.test.ts` uses a real box mesh with nonuniform scale and a 90° owner rotation. It inverts a separately posed surface pick to exact local millimeters. The surface point is refused by the existing clearance envelope. Moving it outward repairs the route. Resizing the mesh preserves the saved coordinates and can invalidate clearance, and a further explicit move repairs it again. The editor does not silently offset surface picks or normalize coordinates by dimensions.

### History, stale work and consumers

`workspace/cableHistory.test.ts` restores stock and ordered anchors through real scene-file compression and ordinary undo/redo. A complete six-operation sequence covers stock, adding, moving, adding another point, reordering and deletion, then undoes and redoes every state. Version merging carries the required anchor owner and detects a missing owner.

`kit/cableRoutes.test.ts` reconciles selected stock and rest points through actual Kit ZIP bytes, current fabrication drawings, packing quantities and Build Along. Its fixture joints are fixed at rest to isolate manufacturing reconciliation. The motion matrix and coupled tests retain full declared movement separately.

`three/viewport/cableRouteLayer.test.ts` covers 100 preview callbacks and one release, oversized-canvas coordinates, scene replacement, geometry changes, undo and pointer cancellation. `cableAnalysisClient.test.ts` drives the real production analysis handler through a controlled worker boundary for geometry reuse, cancellation and late responses. BOM reader tests retain in-flight work across unrelated edits, cancel replaced scenes and suppress stale publication. Completed cancellable results are shared with engineering and Build Along through the existing cache.

`workspace/cableRouteMode.test.ts` verifies leaving drawing tools, selecting endpoint parts and entering ordinary Pose controls. Identical Link or stock choices retain the project identity, so a no-op cannot add an unexpected undo step. A structural patch cannot replace the fixed endpoint fields. `components/build/CableRouteEditor.test.ts` checks Automatic remains the displayed authored policy even when it resolves to a known measured cable.

An initial history test inferred a required joints field from its fixture and failed type checking when ordinary history returned ProjectSettings. Its state variable now has that production type. An initial SSR assertion matched an exact option opening tag and failed on its existing class attribute. The corrected assertion reads the selected option's text and retains both automatic and explicit policy assertions.

### Browser and documentation

`e2e/cableEditing.e2e.test.ts` is the focused CI walkthrough. It opens the generated arm's Cable reach finding, selects stock, adds and numerically moves a point, checks Checks and BOM, restores every route edit through undo/redo, exports and reopens real scene bytes. Build Along route stock and points are checked by `kit/cableRoutes.test.ts`, and route step assignment by `guide/buildAlong.test.ts`. It adds no deadline or retry. The full browser test is not run locally.

The documentation capture uses the ordinary finding and editor controls, then actual canvas drags. Its final measurements and capture log are retained in `scratch/cable-capture-continuation.log` and `scratch/cable-interaction-measurements.json`. The harness serves development bundles when production bundles are absent. Its existing Vite shutdown warning follows successful capture. Images illustrate the finding and edited route, and were not used to judge appearance. [Interaction measurements and limits](performance-engineering.md#cable-editor-interaction-work) distinguish browser operation counts from the compiled-worker timing and memory probe.

### Help coverage

Purchasing and check-reference articles describe explicit route stock. The ready-to-build task includes Edit Route among direct actions, and the part-quote task distinguishes direct actions from agent Fix. Unchanged articles retain their instructions for Strength fixes, on-hand quantities, blocker classification, Pose concepts, keyboard mode exit, guide generation, snapping outside route editing, teaching, the agent hub and ordinary agent undo. Their illustrated states remain applicable. The feature-owned cable article documents the new controls and surface-clearance behavior.

### Final local checks

The final 68-file changed check passed formatting, lint, docs, site copy for 342 pages, types and 2,495 related tests across 371 files. One existing test remained skipped. The log is `scratch/cable-complete-check.log`. The exact-owner and numeric matrix check passed 11 tests, the coupled and complete history check passed four tests, and the full mesh matrix passed all 20 cases. The final documentation and interaction capture passed in 51.65 seconds with no captured browser errors and the existing Vite shutdown warning. Its worker-boundary probe observed the measured 100-event drag and 20 further drags without changing the app's history, worker or browser harness contracts. Full browser export/reopen execution remains with the normal Linux and Windows CI jobs. Build Along controls retain their separate browser walkthrough.


### Cable help preflight correction

The eleven coverage notices were compared with the final production diff. Three articles needed corrections. The remaining eight keep their current instructions and screenshots. No capture state in those eight changes.

| Article | Comparison and result |
| --- | --- |
| Check printed parts are strong enough | FindingRow adds the cable-route label only. Strength still uses Fix for the print-face action or agent fallback. Its failed and passing stress screenshots remain accurate. |
| Count the parts you already own | BuildPanel inserts Wiring before the unchanged purchasing sections. Quantity editing, on-hand arithmetic, toast Undo and cable-product inventory identity remain unchanged. Both inventory screenshots still show those states. |
| The path from design to build | The verdict, BOM and guide behavior described remain true. It already describes measured cable hops and selected lengths. Cable editing does not change its existing readiness claims. |
| Joints and kinematics | Show Pose uses ordinary pose values without changing joint declarations or the modeled rest frame. The tree, loop, rest-pose and inverse-kinematics descriptions remain true. |
| Keyboard shortcuts | Added the concrete Escape behavior for an open cable editor and retention of committed edits. Existing key bindings remain unchanged. |
| Make a build guide | buildCommands adds cable commands alongside unchanged guide commands. Make, Open, Update, PDF controls and the two guide-card screenshots remain accurate. |
| Snap parts together by their mounting holes | Gizmo detaches while cable editing is open. Added the required Done action before moving parts. Port snapping and all three illustrated snapping states remain unchanged after closing the editor. |
| Teach a robot a skill | RightTabPanels only passes cableRoutes to BuildPanel. Simulate, Train, Teach and skill controls are unchanged. |
| The design agent | The contributor guide adds route-consumer facts without changing the article's agent workflow, priority order, follow-ups or undo claims. The hub retains feature-owned contributions. |
| A check blocks Ready to build | Replaced the assumption that every problem offers agent Fix. The instructions now name Edit Route for supported Cable reach findings and retain Fix for agent fallback. Ignore, Restore and Run Checks remain unchanged. |
| Undo what the agent changed | docHistory now restores wiring alongside existing tracked state. Agent per-edit history, Case-only undo restrictions, revert behavior and the existing board/shared-parameter examples remain accurate. |

The three article edits add no app labels. They reuse Edit Route, Cable reach, Fix and Done. Unchanged-help preflight notices for the other eight are retained as reviewed coverage notices rather than creating unrelated publication edits.


### Cable editor browser traversal failure

The 18 November pull request Check failed in `showCableBuildAlong` after the editor, history, Checks, BOM and scene export/reopen assertions completed. The browser case took 91.33 seconds including the configured retry. Both attempts reported step 2 when the helper expected step 1. The aggregate `check` failed because `e2e-changed` failed. Its required, ROS, electrical and copy jobs passed.

The helper waited for the toolbar to exist, which includes the opening state. In that state there is no `data-step`, and `Number(null)` becomes zero. Playwright can resolve the Next step control while opening completes, then click from the first actual step to the second. The helper incorrectly requires the resulting step to equal the opening-state value plus one. This is a test synchronization error, not evidence that playback skipped an assembly step.

The redundant Build Along traversal and its helper are deleted. No assertion is loosened, and no wait, retry or deadline is added. The retained browser case covers the ordinary editor entry, stock, local numeric point, Checks, BOM, full undo/redo and actual scene export/reopen. `kit/cableRoutes.test.ts` independently checks authored stock and transformed rest points through production routing, guide planning, Build Along and actual Kit bytes. `guide/buildAlong.test.ts` checks that each worker route appears exactly once at the first step with both endpoints installed. `e2e/buildCable.e2e.test.ts` retains the separate playback controls walkthrough. Browser delivery of this edited route into playback is no longer asserted by the cable editor case. CI owns the next browser result, and no local browser timing improvement is claimed.


### Cable editor mode review

Opening a route previously left an active Build Along session in place. That session hid the cable overlay and continued to own Escape and history shortcuts. Route opening now closes that session and opens Build through the same action from findings, Wiring and the palette. Show Pose also reselects the endpoint parts, since choosing an unrelated anchor owner can otherwise remove the robot's Pose tab. `workspace/cableRouteMode.test.ts` covers both transitions without a browser or added waits.

Opening a route cancels pending Sketch face replacement, so Escape belongs to route editing immediately. Cable editing owns canvas point callbacks even between placements and suppresses Sketch double-click editing. This prevents a pending Sketch face replacement from consuming a cable-editor click while retaining hidden drawing drafts. A route that disappears after scene replacement exposes no active point placement. No app strings or illustrated control states change.

The review changed-file check passed formatting, lint, docs, site copy for 342 pages, types and 22 related tests across ten files. Its log is `scratch/review-1807-check.log`. The changelog's “cannot” was contracted to satisfy the current copy check. Browser execution remains with CI.

## Cable editor nightly failures on 18 November

[Check 44375421899](https://github.com/JamelHammoud/basecase/actions/runs/44375421899) at `eaeb771eafd90e0257033d250f090115234a435c` failed Linux and Windows browser shard 6 in two independent places. The last full green [44245137178](https://github.com/JamelHammoud/basecase/actions/runs/44245137178) used `38217ff66d93565c46b38e74abcdbf4be8bb39a0`. Merge `e758c7f4c` introduced the cable editor, its browser declaration and its help article after that green run.

The site build is a deterministic regression at that merge. The new help article specified `collection: build`, while `readHelpArticle` accepts `build-and-print`. Both platforms stopped during the site suite's build hook before any site navigation. Correct only the collection metadata. The existing committed-help tests parse the real content and cover collection membership. No site parser, test or dependency change is needed.

Both Linux cable attempts completed editing, full undo/redo, Cable reach and BOM assertions, then exhausted the existing download poll in `reopenCableScene`. `lastDownload()?.name` remained undefined. This does not identify whether export command delivery, scene-preview preparation, encoding or download registration stalled. Reopening had not started. Windows first exhausted the post-redo Cable reach pass poll after authored wiring had been restored. Its retry completed that poll and reached the same missing-download boundary. The log does not establish a shared cause for the Windows readiness and export observations.

Classification for the Linux browser declaration is intermittent. Single [Linux diagnostic 44379268899](https://github.com/JamelHammoud/basecase/actions/runs/44379268899), ticket `606c9e69-a65d-4b68-b085-c60c35d3de2c`, passed the complete declaration on the same workload revision with one worker, retries disabled and quarantine off. Its process took 39,521 ms and its assertion 27,627.621812 ms on image `20261111.196.1`, Node 26.13.0 and four CPUs. The manifest and complete report are retained under `scratch/diagnostics/606c9e69-a65d-4b68-b085-c60c35d3de2c/`. This is one observation, not a failure-rate measurement.

Single [Windows diagnostic 44380049632](https://github.com/JamelHammoud/basecase/actions/runs/44380049632), ticket `84d890b1-cb19-4287-9c8a-d9a86246f4f0`, reproduced the missing-download boundary on the same workload revision with one worker, retries disabled and quarantine off. Its process took 50,855 ms and its failed assertion 37,864.3766 ms on image `20261103.298.1`, Node 26.13.0 and four CPUs. Editing, history, Cable reach and BOM completed. The manifest and complete report are retained under `scratch/diagnostics/84d890b1-cb19-4287-9c8a-d9a86246f4f0/`. This establishes Windows export reproduction and readiness progress in that observation, not a complete Windows pass, a Windows failure rate or a common root cause with Linux.

Quarantine only the exact declaration on Linux and Windows through 28 November 2026 under [#1815](https://github.com/JamelHammoud/basecase/issues/1815), with `loop:fix`, `loop:next` and `loop:priority`. Keep its assertions, deadlines and retry configuration unchanged. Trace readiness after redo separately from export command delivery, preview preparation, encoding, download and reopening. Restore each affected platform only after a demonstrated cause and at least ten baseline and ten candidate observations at equal load with retries disabled and the original assertions and deadlines. The repair session performs no repeated measurements.

Fast routing matrices, coupled motion, exact owner geometry, stock and BOM reconciliation, history, real scene-file bytes and worker cancellation remain active. `e2e/buildCable.e2e.test.ts` retains the separate playback controls path. This leaves the Linux and Windows browser editor and persistence paths observed only in quarantine. macOS retains the complete declaration. Product code stays intact.

The focused content check passed formatting, lint, documentation, site copy for 342 pages, types and all 12 existing committed-help tests. The final four-file check passed 128 related tests across 15 files, formatting, documentation, site copy and quarantine validation for 101 active entries. Preflight reported no findings. No local browser test or full suite ran.

### Cable recurrence in Check 44380885141

[Check 44380885141](https://github.com/JamelHammoud/basecase/actions/runs/44380885141) at `1947469048aae56913d833fbfea9645ee226cabb` predates the quarantine merged in #1816. Linux again completed editing, undo/redo, Cable reach and BOM, then missed download registration in `reopenCableScene`. Both Windows attempts instead missed the initial Cable reach failure poll at line 37, before opening the editor. This initial readiness boundary is distinct from the earlier post-redo readiness stall and export failure. Worker startup, input delivery, result delivery and finding presentation are not distinguished. Existing #1815 and its exact Linux and Windows quarantines cover this declaration without a second entry or product change. Retained logs are `scratch/failed-linux-shard6.log` and `scratch/failed-windows-shard6.log`. The earlier diagnostics establish Linux intermittency and Windows export reproduction, not the cause of the new initial Windows readiness stall.

## Related incident summaries

Historical cross-owner observations remain in the linked summaries. Add new evidence and restoration observations to this note, beside the feature they exercise. Implementation, coverage judgments and quarantine restoration remain with the existing repair owners.

- [Nightly build exclusions on 21 November](node.md#nightly-build-exclusions-on-21-november).
- [Additional build and replay boundaries in Check 44885120824](node.md#additional-build-and-replay-boundaries-in-check-44885120824).

## Cable reach playback on 27 November

[Check 46035381829](https://github.com/JamelHammoud/basecase/actions/runs/46035381829) at `0879a160f8182db93dd9d80034145c8fdb8ba554` failed the active Windows Cable reach playback declaration at line 80. Build opened, but the initial check never exposed the required fail status. Endpoint selection and playback had not started. Same-revision run 46001412880 passed the Windows declaration in 17442 ms. The failure therefore does not establish incorrect cable routing, playback persistence or an environment regression.

Focused [diagnostic 46062007041](https://github.com/JamelHammoud/basecase/actions/runs/46062007041), ticket `4a01b538-4de3-4c4f-a92e-46dfa3256adc`, passed the complete declaration in 21043.6614 ms, with a 32680 ms process, one worker, retries disabled and quarantine off. Its verified manifest retains the Windows environment. Classification is intermittent Windows initial-check delivery with the source stage unresolved. The full endpoint, step-specific routes, labels, backward navigation and unchanged scene assertions remain active. No retry, timeout, assertion or exclusion changes. Existing wiring owner #1815 retains readiness preparation and delivery separately from route export and persistence.


## Current replay tab handoff on Check 46105490716

At `bec6b2749a7db3e429481c97e280d945bfa4a5fd`, [Check 46105490716](https://github.com/JamelHammoud/basecase/actions/runs/46105490716) failed the modeled-current browser story on Linux shard 11 while opening Build after `mountOtherBuildTab`. The Build button had resolved from the previous active workspace, then remained invisible throughout the existing 30-second action deadline. The helper called the React tab setter through page.evaluate and returned without observing the requested selection. Windows shard 6 stalled earlier during Build layout action delivery, and the retained replay story failed to observe Historical evidence after Add Point and a second Inspect Current command at line 86. These are distinct boundaries, not evidence for one computation failure.

The existing tab helper now observes the exact requested active id before returning, including both dismissal switches. This waits for an already requested state transition and adds no delay, deadline or retry. Inspect Current fills the mounted palette search and clicks the exact matching command, avoiding unscoped Enter delivery. All numerical, field, history, clearing, tab-dismissal and no-robot-command assertions remain. Candidate hosted completion is unmeasured. The Windows initial Build action and historical-state delivery after the wiring edit remain unresolved under #2016. This run had already reopened the retained result and enabled Compare before that edit.
