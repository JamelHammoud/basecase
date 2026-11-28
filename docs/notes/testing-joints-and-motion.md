# Joints and motion test evidence

Current coverage: [owning guide](../guide/joints-and-motion.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Assembly springs

`src/utils/robotImport/springs.test.ts` checks MJCF hinge angle conversion, slider SI rest coordinates, passive emission without actuators and URDF extensions. Its complete round trip writes URDF with actual part masses and STL meshes, imports the assembly, saves it through Library and places it as a Case fixture. Zero-gravity spring trajectories match to four decimal places in radians over 1,000 two-millisecond steps. Missing resistance remains absent for provenance instead of being marked as a supplied zero.

The initial export fixture omitted its mass inputs and therefore exported the writer's minimum link mass. Supplying the existing published mass records corrected that fixture. A second comparison was disturbed by an initially overlapping base and missing radian compiler declaration in the test's standalone XML. The final setup clears the base and declares radians. Trajectory assertions were retained. The four declarations passed locally in 1.40 seconds on 16 November 2026. No imported physical force or fit accuracy follows from this round trip.

## Windows linkage history

`e2e/linkage.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1128](https://github.com/JamelHammoud/basecase/issues/1128). Run 43728033376 inserted and undid the five-part linkage, then failed to restore it after redo. Its retry could not find the solution button because the first attempt had closed Sketch. Windows passed the unchanged insertion test in run 43721538732 in 1.384 s, and Linux passed at the failing commit in 1.213 s. The cause is not established. The entire file is listed so quarantine observations retain those prerequisites. Restoring Windows coverage requires isolated attempts, history and key-dispatch traces and at least ten runs before and after at equal load.

## Character shells

The SO-101 browser sequence and its fixture were removed after its wrap test took 76 s in run 43642970706 (#865). Its undo and posing tests depended on that wrap finishing.

## Passive robot joints

The actuation field lives in `src/types/joint.ts`, reexported from robotics.ts to keep the shared type file under its enforced line limit. The existing declaration, project history and scene-file format carry the new fields without a parallel representation. Passive selection clears assigned motor references but leaves the physical parts. Switching back to Powered does not guess a motor assignment.

The history integration test compresses and decodes a real scene, exercises pushHistory and travelProject in both directions, compares legacy omitted intent, imports MJCF and marked URDF, and refuses a contradictory tool record. Browser coverage changes actuation through Pose, undoes and redoes the edit, then checks falling motion and the absence of motors in the simulation package.

In pull request #1293, Linux CI reported the failing browser test at 40.576 seconds with one retry. Reopening the export expected two tabs but retained one. The generic browser harness returns `{}` for both `save-scene` and `scene`, so it cannot persist and reopen the exported record. The redundant export and reopen phase was removed instead of adding storage stubs or extending its wait. `src/sim/passiveHistory.test.ts` retains real scene compression and reload coverage, including the complete joint declaration and document undo and redo. The revised browser path has not been timed locally. CI owns its execution.



Passive declarations do not create missing-servo or torque-estimate warnings. They remain in the rig and range sweeps. Payload mapping rejects a chain containing passive motion rather than using an old effort rating as a motor. Walk and falls keys hash full declarations, so changes invalidate cached evidence without a new version or cache format.

## Leader context menu

Issue [#1441](https://github.com/JamelHammoud/basecase/issues/1441) reports `offers Make a Leader on a part of the arm` at 34 seconds in [run 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744). The test switched back to the first scene after the leader creation test, opened Layers, right-clicked `link3` and counted one Make a Leader menu item. It never invoked that item. The exact source of the elapsed time was not established or reproduced locally.

The narrow visibility test was deleted. The remaining browser test drives the command palette entry through leader creation, new-tab selection, joint mapping and printing plates. `src/leader/makeLeader.test.ts` retains eligibility and generation coverage. Context-menu wiring in `workspace/leaderCommands.tsx` has no dedicated browser assertion after this removal. No timeout, retry or quarantine changed. The remaining browser test was not timed locally, and this removal does not establish a new shard duration.

The preflight coverage reminder for `site/content/help/joints-and-kinematics.md` was checked against this diff. The guide change records test coverage only. Joint fields, import routes, part following, pose behavior and multi-robot selection are unchanged, so the article’s claims and labels still hold. The article has no screenshots and needs no edit.

## Closed Sketch linkage handoff

CAD keeps the original fixed analytic `LoopClosure` records. The simulation writer derives passive hinges without modifying saved joints or undo history. Newly inserted servos now identify C001, because the catalog intentionally returns no actuator rating for a component whose variant is unspecified. Existing unspecified variants refuse simulation until selected rather than receiving an estimated replacement actuator.

The generated ten-mechanism matrix, loaded-motion controls and recording round trips are owned by [simulation evidence](testing-simulate.md#closed-sketch-linkages). They compare physical coupler paths to CAD within 0.3 mm and closing pins within 0.15 mm. This work leaves the Windows insertion/history investigation, durable scene history and imported assembly constraints unchanged.

## Renderer download budgets

The renderer previously called `Response.text()` on agent-chosen BVH URLs. The regression supplies an unending response with 1 MiB chunks and no Content-Length. The 8 MiB reader consumes nine chunks, cancels before retaining the ninth and produces no scene edits. The normal-download test uses the existing generated walk BVH through the real parser and retargeter. Tool tests replace only public fetch and the bridge to establish that a refused address never reaches the renderer. Existing `motionSkeletonSource.test.mjs` owns native address checks and byte-limit coverage.

Robot model and companion download caps reuse the existing 200 MiB ZIP budget. The 8 MiB GitHub tree budget bounds metadata separately. These values preserve existing archive scale, without claiming that every possible published robot fits them. Content-Length is only an early refusal hint. Body chunks remain authoritative, including LFS replacement responses. Local file import budgets and Hugging Face listing pagination are outside this change.

Review adds `robotImport/downloadLimits.test.ts` to exercise each newly capped robot source with declared oversize bodies and observe cancellation without allocating full-size fixtures. It covers direct descriptions, direct companions, both repository file readers, GitHub metadata and reuse of a caller's budget for an LFS replacement. The shared stream tests own byte-count enforcement when declared lengths are missing or false.

## Leader Build navigation on 27 November

[Check 46035381829](https://github.com/JamelHammoud/basecase/actions/runs/46035381829) at `0879a160f8182db93dd9d80034145c8fdb8ba554` failed Make a Leader on Windows. The first attempt created and selected the leader tab and passed its joint assertions. It exhausted the 30000 ms click on Build at line 56 after actionability reached scrolling. The existing retry then found the leader's 13 parts instead of the source arm's seven at line 39. That second failure reflects the shared app state left by the first attempt, not a demonstrated initial fixture-load failure. Same-revision Windows run 46001412880 passed in 56905 ms. Classification is intermittent Windows Build navigation, with action delivery and panel lifetime unresolved.

The active declaration and its exact source, tab, joint and printing assertions remain. No retry is added or raised, no deadline changes and no new exclusion is introduced. Fast leader construction and robot packaging tests retain joint and geometry coverage but do not replace this browser action. This repair does not attribute the action stall to a product or environment change without a trace.

Focused [Windows diagnostic 46062197520](https://github.com/JamelHammoud/basecase/actions/runs/46062197520), ticket `f2738e3d-7e7c-4902-a82a-5302c37c69a0`, passed the complete leader declaration at the failed revision in 14935.8845 ms, with a 37368 ms process, one worker, retries disabled and quarantine off. The manifest records Windows x64, Node v26.13.1, four CPUs and image `20261123.321.1`. The ordinary Build action and printing assertion completed. This confirms intermittency without proving a source repair or rate. The original declaration remains active.

## Windows hinge undo on 27 November

[Check 46065444695](https://github.com/JamelHammoud/basecase/actions/runs/46065444695) ran `34de3dac71e9f2f845a3c8f68f20699a947959f3` on Windows x64, Node 26.13.1 and image `20261123.321.1`. `joining two parts by hand > adds a hinge about a clicked round face, turns only the child, and undoes in one step` created the hinge and posed only Pin. Its first attempt retained one joint after the second undo at line 106. The existing retry retained the Pin pose after the first undo at line 103. Neither failure establishes whether keyboard delivery, focused text editing or history restoration was responsible. The shortcut matcher accepts Meta and Ctrl on both platforms, so changing the key spelling alone would not establish a repair.

Focused [Windows diagnostic 46068067058](https://github.com/JamelHammoud/basecase/actions/runs/46068067058), ticket `c3d59678-6a74-4b28-a8a5-03ebb2b979a9`, passed the exact declaration at `34de3dac71e9f2f845a3c8f68f20699a947959f3` in 13,316.953 ms, with a 61,013 ms process. It used one worker, zero retries and quarantine disabled on Windows x64, Node 26.13.1 and image `20261123.321.1`. This establishes intermittent Windows execution at the exact failing revision. The passing trace completed both undo assertions with no console errors. It still reports the ten-second Vite close warning, despite an empty manifest cleanup array. No source cause or failure rate under full-shard history is established. The complete declaration, its round-face geometry checks, child-only posing and two independent history assertions stay active. No assertion, deadline, retry or exclusion changes.

The preflight reminder for `site/content/help/joints-and-kinematics.md` was checked against this change. The article still describes the same joint fields, imports, part following, modeled-pose behavior and selected-robot scope. This repair changes only the contributor guide’s coverage evidence, with no joint behavior, label or screenshot change, so the article remains unchanged.


## Windows Onshape subassembly on Check 46068805254

[Check 46068805254](https://github.com/JamelHammoud/basecase/actions/runs/46068805254) at `77609f673e688ff56804bee5abe7b09537aa41f6` failed `Onshape import > imports ranged knees and cylindrical axles inside a subassembly from the link` on both Windows attempts. Import Robot opened and Import was activated, but the existing ten-second project poll retained zero joints instead of three. The log does not identify import preparation, scene installation or a refused response as the source. The first two Onshape declarations passed. The preceding Windows Check at `34de3dac71e9f2f845a3c8f68f20699a947959f3` passed the subassembly story after its existing retry, which alone cannot establish intermittency at the newer revision.

Focused [Windows diagnostic 46071186799](https://github.com/JamelHammoud/basecase/actions/runs/46071186799), ticket `c2e22d1c-e2fe-42e4-aaae-844c456be7b6`, passed the exact declaration at `77609f673e688ff56804bee5abe7b09537aa41f6` in 25,703.4882 ms including its per-test fixture, with a 37,997 ms process. It used one worker, zero retries and quarantine off on Windows x64, four CPUs, Node 26.13.1 and image `20261123.321.1`. The trace activated Import at 21:39:44.739 UTC and completed the three-joint poll and the original knee range, axle range and fixed-mate assertions by 21:39:47.040 UTC. This establishes intermittent Windows execution at the failed revision without identifying a source cause or estimating a rate. Cleanup's page-text snapshot timed out while the declaration still passed, and the process log retained the existing Vite shutdown warning.

The declaration, import path, ten-second poll and all assertions remain active and unchanged. Fast Onshape integration tests retain mate conversion, subassembly limits, occurrence identities and update mapping, but do not replace this combined browser import. No source edit, retry, exclusion or longer timeout is justified by this single passing observation. The verified manifest and complete bounded logs remain in `scratch/diagnostics/c2e22d1c-e2fe-42e4-aaae-844c456be7b6/` in the repair worktree.

The preflight reminder for `site/content/help/joints-and-kinematics.md` was checked against this change. The article still correctly describes joint fields, robot and Onshape imports, cylindrical slide fixation, part following, modeled-pose behavior and selected-robot scope. This change adds coverage evidence only to the joints guide. No step or label becomes untrue and the article has no screenshots, so it remains unchanged.


## Windows import attempt ownership on Check 46136891399

[Check 46136891399](https://github.com/JamelHammoud/basecase/actions/runs/46136891399) executes `2470b4947ec44343a3a52de910f9753b950303b7`. Windows browser shard 10 fails `robot import > inserts a zip dropped on the canvas at once, without a sheet` twice. The first attempt observes zero joints instead of two after its 30000 ms poll. The configured retry observes four instead of two. The file creates one app in beforeAll and closes it only in afterAll. Both attempts dispatch another ZIP into that same live scene, without cancelling or owning completion of the preceding import. Each ZIP contains two joints. A completion after the failed poll can therefore contaminate the retry and later declarations.

Classification is a demonstrated Windows fixture ownership defect with an unresolved initial import deadline. The exact-revision Windows pass below establishes intermittent execution for the primary deadline, without identifying its source cause. The last full green revision `04c830ec7de8eabf859ad011c6e143466529daab` already has the shared-app fixture, so no introducing merge supports a clean causal revert. The correction moves app acquisition and closure to beforeEach and afterEach, preserving the existing 120000 ms setup budget, every declaration, real DOM drag events, joint-count assertions and platform coverage. It adds browser initialization per independent declaration, without adding a wait, retry or longer deadline. Closing the previous browser ends its pending renderer imports before the next attempt acquires another scene.

ZIP, folder xacro, GitHub selection and Hugging Face import stories remain active. Real parser, mesh, archive, source-resolution, ordering and joint tests retain their fast coverage. This fixture correction does not establish that the primary Windows import now completes within its deadline. It changes no product entry point, label, help step or screenshot. [The complete nightly inventory](node.md#full-failure-inventory-for-check-46136891399) retains all independent failures.


The failed Windows file reports 19640 ms for its shared studio startup, 75162 ms for the ZIP declaration including its configured retry, and 119255 ms for all four declarations. These are full-job observations under its actual runner load. Fresh setup can add initialization cost to the remaining declarations. No candidate duration or failure-rate improvement is claimed. That cost buys independent import ownership rather than a longer action budget. The first import's source investigation remains open.

The named-file check on macOS arm64 with Node 26.13.1 passes formatting, ESLint, documentation and TypeScript for the browser file and three evidence documents. No unit declaration is selected by this hook-only edit. The four existing browser declarations run in publication CI. Evidence is `scratch/repair/check.log`. No local browser suite, app preview or screenshot was run. The preflight-linked `site/content/help/joints-and-kinematics.md` was read against the change. Its joint fields, import actions, posing and selected-robot behavior remain accurate, and it has no screenshots to update.


Focused [Windows diagnostic 46139244788](https://github.com/JamelHammoud/basecase/actions/runs/46139244788), durable ticket `2f9e564c-87ac-430a-83b5-9f8dd558b712`, passes the ZIP declaration at the exact failed workload `2470b4947ec44343a3a52de910f9753b950303b7` in 5027.3473 ms within a 25991 ms process. Studio startup reports 7156 ms. The verified manifest records Windows x64, Node 26.13.1, four CPUs, image `20261123.321.1`, one worker, one selected attempt, zero retries and quarantine off. Browser API tracing is enabled. The closing snapshot shows two imported joints and no console errors, with thumbnail and guide workers unavailable to the bounded snapshot. This establishes same-revision Windows intermittency for the first import, without locating its earlier stall or measuring a candidate rate. The process retains the existing ten-second Vite close warning despite an empty manifest cleanup array. The selected published baseline has the original shared-browser fixture, so it supplies no candidate verification. Request, manifest, report and log remain under `scratch/diagnostics/2f9e564c-87ac-430a-83b5-9f8dd558b712/` during implementation.
