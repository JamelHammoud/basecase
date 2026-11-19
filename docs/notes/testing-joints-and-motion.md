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

## Leader context menu

Issue [#1441](https://github.com/JamelHammoud/basecase/issues/1441) reports `offers Make a Leader on a part of the arm` at 34 seconds in [run 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744). The test switched back to the first scene after the leader creation test, opened Layers, right-clicked `link3` and counted one Make a Leader menu item. It never invoked that item. The exact source of the elapsed time was not established or reproduced locally.

The narrow visibility test was deleted. The remaining browser test drives the command palette entry through leader creation, new-tab selection, joint mapping and printing plates. `src/leader/makeLeader.test.ts` retains eligibility and generation coverage. Context-menu wiring in `workspace/leaderCommands.tsx` has no dedicated browser assertion after this removal. No timeout, retry or quarantine changed. The remaining browser test was not timed locally, and this removal does not establish a new shard duration.

The preflight coverage reminder for `site/content/help/joints-and-kinematics.md` was checked against this diff. The guide change records test coverage only. Joint fields, import routes, part following, pose behavior and multi-robot selection are unchanged, so the article’s claims and labels still hold. The article has no screenshots and needs no edit.

## Closed Sketch linkage handoff

CAD keeps the original fixed analytic `LoopClosure` records. The simulation writer derives passive hinges without modifying saved joints or undo history. Newly inserted servos now identify C001, because the catalog intentionally returns no actuator rating for a component whose variant is unspecified. Existing unspecified variants refuse simulation until selected rather than receiving an estimated replacement actuator.

The generated ten-mechanism matrix, loaded-motion controls and recording round trips are owned by [simulation evidence](testing-simulate.md#closed-sketch-linkages). They compare physical coupler paths to CAD within 0.3 mm and closing pins within 0.15 mm. This work leaves the Windows insertion/history investigation, durable scene history and imported assembly constraints unchanged.

## Arm workspace inspection

Issue #1846 adds inspection for an already jointed arm. `src/skills/armWorkspaceCases.ts` generates planar two-link, three-axis, six-axis, short-range elbow, offset-tool, long-tool, rotated-pedestal, asymmetric-limit, parked-gripper and dual-arm fixtures. The six-axis fixture omits the gripper, while the parked-gripper fixture keeps nonzero slide positions. Only the selected ancestry changes.

`armWorkspace.test.ts` independently reproduces every displayed matrix point through ordinary Pose forward kinematics, then resets a separate MuJoCo engine and queries contacts with the same 2 mm clearance margin. It also checks deterministic positions and configurations, unchanged input serialization, world obstacles, empty exhausted budgets and unsupported sources. The rotated fixture uses authored millimeter positions rounded to 0.001 mm and axes to six decimal places, matching the current MJCF writer's precision. An initial arbitrary-precision fixture differed by 0.000893 mm because the writer serializes meters with six decimal places. The strict FK assertion remains 0.000001 mm for representable inputs. The UI displays positions at 0.01 mm, without a physical-accuracy claim.

`armWorkspaceReplay.test.ts` resets rotated and parked-gripper samples in the existing native replay harness. C MuJoCo and WASM agree within the existing 0.000001 state tolerance, with matching contact sets. The browser entry has its own `e2e/armWorkspace.e2e.test.ts` file and disables retries. It loads a generated fixed arm, selects the tool, invokes the palette action, picks a canvas sample, compares the ordinary preview and unchanged scene, then checks the Skills target row.

The screenshot walkthrough exercised those entry points on macOS using `openApp`, with no app errors. It captured the sample cloud, selected configuration and Skills row into the linked help article. It did not judge appearance. The first capture exposed that fixed-arm animations were hidden from Skills. The existing move rows now include fixed arms and respect the animation's robot key. The regular browser test is left to Linux and Windows CI. Local screenshot capture occasionally reports the existing Vite-server close warning after its test passes, with the process exiting successfully. No timeout, retry or quarantine was added.
