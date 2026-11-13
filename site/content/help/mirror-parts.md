---
title: Mirror parts to the other side
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 13
keywords:
  - mirror
  - symmetry
  - symmetric
  - flip
  - left and right
  - opposite side
  - twin
  - copy
related:
  - choose-the-agent
  - parts-assemblies-and-mounting-ports
covers:
  - src/agent/agentMirror.ts
  - src/agent/mirrorDatum.ts
  - src/workspace/applyAgentOps.ts
  - src/workspace/mirrorHints.ts
  - electron/cad-mcp/sceneTools.mjs
  - src/workspace/contextMenuItems.tsx
---

Build one arm or leg, then have the agent mirror it to the other side, with servos and screw holes landing in the right places.

There's no Mirror command; the agent mirrors parts for you. It needs an agent connected, as in [Choose the agent](/help/choose-the-agent).

1. Right-click a part to mirror and choose **Quote Part**.
2. In the Agent tab's composer, say what to mirror and where, such as “Mirror this leg to the right side”.
3. Press [[↩]] to send.

The copies take the source's names with left and right swapped, or front and rear. Parts the agent modeled are mirrored shape and all.

## Servos, boards and screws

Real components can't be built mirror-image, so the agent doesn't flip them. It places each copy so its output shaft, holes and mounting points land exactly where the mirrored ones would be.

## Keep both sides in step

Each copy stays linked to its source. Make changes on the source side, then ask the agent to mirror it again; the new copy replaces the old one. If either side is edited on its own, the agent is reminded to mirror again.

**Quote Part** works in the desktop app. To sculpt both sides of one part at once, use **Mirror X** in [Sculpt a part](/help/sculpt-a-part).
