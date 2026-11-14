# Snap a dragged part onto matching mounting holes, and keep it attached

Closes #226.

Dragging a part now snaps it onto a nearby part's matching holes or bore, and saves the result as a mate, so the part follows its target from then on. Until now only the agent's `mate` tool used port data, and placing a servo by hand meant lining it up by eye.

It's built on the agent's code. During a drag, `snapTargets` gathers the ports of every visible part, skipping hardware and anything already mated to the part being dragged. The drag picks the nearest compatible pair within `SNAP_MM` (8 mm), judged by `portFit`, the same rules `mate` uses. The pose comes from `planMate`, so a hand snap and an agent mate put the part in the same place, and a test holds them to within 0.1 mm. On release the mate is saved on the part. Moving the target carries it along, dragging it more than 8 mm away drops the mate, and holding ⌘ skips snapping.

`mate` changed too: when two ports don't fit, say M3 holes against M2, it now reports the mismatch instead of mating the parts anyway.

Hardware is left out on purpose (`snapPorts` returns nothing for it), because screws and inserts go in with `fasten`. Groups, multi-selections and posed robots don't snap yet.

**Testing**
- `src/agent/snap.test.ts` has 18 tests: which ports pair and which don't, the nearest pair between an STS3215 and a bracket, nothing beyond 8 mm, never onto a part mated to the one being dragged, the pose matching `planMate`, ⌘ turning it off, and the mate following its target or dropping.
- `e2e/snap.e2e.test.ts` drags a servo onto a bracket, checks the pose against the agent's plan, moves the bracket, undoes twice, and ends with a ⌘ drag that doesn't snap. It ran in CI, not locally.
- A scripted drag on the real gizmo snapped the servo to (32.5, 81.65, −20), the pose the agent planned.
