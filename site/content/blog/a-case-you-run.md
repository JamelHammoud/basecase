---
title: A Case you run
date: 2026-11-13
---

A Case in Basecase is a world and a goal a robot tries in simulation. Until now, running one with a robot connected meant three places at once: the Case and its tries in the Simulate tab, the emulated robot in Operate, and the camera views floating over the canvas.

Now a Case opens as a Command Center. Click the expand button in its Brief, or choose Open Command Center in ⌘K, and the window becomes the Case's app: the robot on the canvas, its cameras in a card on the left, and on the right the brief, the emulated servos with their rung and Stop, and Try It with every try under it. While you drive, anything the Case counts as a failure shows up in red as it happens. Done or Esc puts the studio back exactly as it was.

Nothing in it is new code drawing the same thing twice. The tiles are the camera strip's, fed by the same worker; the servos are Operate's rows; the tries are Results. There's still one canvas and one scene.

A Case file can now say how it runs: its input, keys or gamepad, and which panels it opens with. That's the start of asking the agent for a whole Case app in one sentence. The Command Center keeps every Case file you already have working: format 1, unchanged.
