# Joints and motion test evidence

Current coverage: [owning guide](../guide/joints-and-motion.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows linkage history

`e2e/linkage.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1128](https://github.com/JamelHammoud/basecase/issues/1128). Run 43728033376 inserted and undid the five-part linkage, then failed to restore it after redo. Its retry could not find the solution button because the first attempt had closed Sketch. Windows passed the unchanged insertion test in run 43721538732 in 1.384 s, and Linux passed at the failing commit in 1.213 s. The cause is not established. The entire file is listed so quarantine observations retain those prerequisites. Restoring Windows coverage requires isolated attempts, history and key-dispatch traces and at least ten runs before and after at equal load.

## Character shells

The SO-101 browser sequence and its fixture were removed after its wrap test took 76 s in run 43642970706 (#865). Its undo and posing tests depended on that wrap finishing.

## Passive robot joints

The actuation field lives in `src/types/joint.ts`, reexported from robotics.ts to keep the shared type file under its enforced line limit. The existing declaration, project history and scene-file format carry the new fields without a parallel representation. Passive selection clears assigned motor references but leaves the physical parts. Switching back to Powered does not guess a motor assignment.

The history integration test compresses and decodes a real scene, exercises pushHistory and travelProject in both directions, compares legacy omitted intent, imports MJCF and marked URDF, and refuses a contradictory tool record. Browser coverage exports a scene file and reopens it in another tab, then returns to the original tab for undo and redo. Opening a file creates a new history rather than inventing history across files.
