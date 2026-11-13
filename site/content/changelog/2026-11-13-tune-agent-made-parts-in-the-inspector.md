---
title: Tune agent-made parts in the Inspector
date: 2026-11-13
image: /changelog/tune-agent-made-parts-in-the-inspector/tuned.png
---

A part the agent designed now shows its named dimensions in the Inspector, like `wall` or `clearance`, and changing one rebuilds the part from its code in place, with mated parts following.

## Where it is

Select a part the agent made and look under Size in the Inspector. Dimensions lists the numbers its OpenSCAD code sets at the top level, by the names the code uses. If the code gives a Customizer range after a number, such as `wall = 2; // [1.2:0.4:4]`, the field keeps the value between 1.2 and 4 and ↑ and ↓ step it by 0.4. The agent now writes its parts this way, naming the numbers a person would want to change.

![Dimensions in the Inspector, with wall at 2 on a servo mount](/changelog/tune-agent-made-parts-in-the-inspector/dimensions.png)

## What happens when you change one

Type a value and press Enter. Basecase changes that one number in the part's code, leaves every other character as it was, including the holes `fasten` cut and a mirrored copy's mirror, and compiles the code in the same sandboxed kernel the agent uses. The new part takes the old one's place, and anything mated to it, a servo on a mount or a bracket on a horn, moves to stay mated. One ⌘Z puts all of it back.

![The servo mount after wall is set to 5, with the servo raised on top of it](/changelog/tune-agent-made-parts-in-the-inspector/tuned.png)

Before this, thickening a wall after a test print meant asking the agent, and Size only stretched the mesh, holes and all.

## What it checks

The agent can freeze requirements on a part, such as a 1.6 mm minimum wall, a count of through holes or a flat base. A value that breaks one keeps the old part, and a message says which requirement failed and what was measured. A compile error keeps the old part too.

## What it doesn't do yet

Parts written in replicad don't show Dimensions, and numbers computed from others (`w = 2 * wall`) aren't listed; change the one they're computed from. The web demo has no kernel, so it doesn't show the section.
