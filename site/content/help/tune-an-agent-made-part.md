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

You can change a number in a part the agent designed, such as its wall thickness. The part rebuilds from its own code, and the parts mated to it follow.

1. Select a part the agent made, either in the canvas or in Layers.
2. In the Inspector, find Dimensions under Size. Each row is a number that the part's code names, like `wall` or `clearance`.
3. Type a new value and press [[↩]]. Or press [[↑]] and [[↓]] to step the value up or down. If the code gives a range after the number, such as `// [1.2:0.4:4]`, the value stays inside that range.
4. Wait a moment while the part compiles. The part changes in place, and a servo or bracket mated to it moves with it.
5. To undo the change, press [[⌘Z]]. The part, its Dimensions values and everything that moved with it go back together.

![Dimensions in the Inspector, with wall at 2 on a servo mount](/help/tune-an-agent-made-part/dimensions.png)

![The servo mount after wall is set to 5, with the servo raised on top of it](/help/tune-an-agent-made-part/tuned.png)

The agent can set requirements for a part, such as a minimum wall or a number of through holes. If your new value breaks one of them, the part stays as it was, and a message tells you which requirement failed and what was measured.

Dimensions appears only in the desktop app, and only on OpenSCAD parts whose code sets its numbers at the top level. Size, above it, still scales the whole part instead of rebuilding it.
