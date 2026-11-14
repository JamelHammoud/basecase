---
title: Tune an agent-made part
date: 2026-11-13
collection: design
type: task
covers:
  - src/components/inspector/DimensionsSection.tsx
  - src/workspace/useCadTune.ts
  - src/agent/cadTune.ts
  - electron/cad-kernel/dimensions.mjs
  - electron/backend/cadTune.mjs
---

Change a number in a part the agent designed, such as its wall thickness, and the part is rebuilt from its own code, with the parts mated to it following.

1. Select a part the agent made, in the canvas or in Layers.
2. Find Dimensions in the Inspector, under Size. Each row is a number the part's code names, like `wall` or `clearance`.
3. Type a new value and press [[↩]], or use [[↑]] and [[↓]] to step it. When the code gives a range, such as `// [1.2:0.4:4]` after the number, the value stays inside it.
4. Wait a moment while the part compiles. It changes in place, and a servo or bracket mated to it moves with it.
5. Press [[⌘Z]] to undo the change. The part and everything that moved with it go back together.

![Dimensions in the Inspector, with wall at 2 on a servo mount](/help/tune-an-agent-made-part/dimensions.png)

![The servo mount after wall is set to 5, with the servo raised on top of it](/help/tune-an-agent-made-part/tuned.png)

If the new value breaks a requirement the agent set for the part, such as a minimum wall or a number of through holes, the part stays as it was and a message names the requirement and what was measured.

Dimensions appears only on OpenSCAD parts whose code sets its numbers at the top level, and only in the desktop app. Size, above it, still scales the whole part instead of rebuilding it.
