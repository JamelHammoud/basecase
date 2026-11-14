---
title: Tune agent-made parts in the Inspector
date: 2026-11-13
image: /changelog/tune-agent-made-parts-in-the-inspector/tuned.png
---

You can now tune a part the agent designed in the Inspector.

Select it and its named dimensions show up, like `wall` or `clearance`. Change one and Basecase rebuilds the part from its code, in place. Parts mated to it follow along.

## Where it is

Select a part the agent made and look under Size in the Inspector. Dimensions lists the numbers its OpenSCAD code sets at the top level, by the names the code uses.

A number can carry a Customizer range, like `wall = 2; // [1.2:0.4:4]`. The field then keeps the value between 1.2 and 4, and ↑ and ↓ step it by 0.4.

The agent now writes its parts this way, and names the numbers a person would want to change.

![Dimensions in the Inspector, with wall at 2 on a servo mount](/changelog/tune-agent-made-parts-in-the-inspector/dimensions.png)

## What happens when you change one

Type a value and press Enter. Basecase changes that one number in the part's code and leaves every other character as it was, including the holes `fasten` cut and the mirror on a mirrored copy. Then it compiles the code in the same sandboxed kernel the agent uses.

The new part takes the old one's place. Anything mated to it, like a servo on a mount or a bracket on a horn, moves to stay mated. Press ⌘Z once and all of it goes back.

![The servo mount after wall is set to 5, with the servo raised on top of it](/changelog/tune-agent-made-parts-in-the-inspector/tuned.png)

Until now, thickening a wall after a test print meant asking the agent. Size only stretched the mesh, holes and all.

## What it checks

The agent can freeze requirements on a part, such as a 1.6 mm minimum wall, a count of through holes or a flat base. If a value breaks one, you keep the old part, and a message tells you which requirement failed and what was measured. A compile error keeps the old part too.

## What it doesn't do yet

Parts written in replicad don't show Dimensions. Dimensions doesn't list numbers computed from others either, like `w = 2 * wall`. Change the number they're computed from instead.

The web demo has no kernel, so the section doesn't show up there.

Read [Tune an agent-made part](/help/tune-an-agent-made-part) in the help center for the steps.
