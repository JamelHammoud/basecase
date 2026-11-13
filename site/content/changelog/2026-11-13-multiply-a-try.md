---
title: Multiply a try into varied demonstrations
date: 2026-11-13
image: /changelog/multiply-a-try/cover.png
---

You can now turn one passed try into dozens of passing ones for a dataset. Multiply runs it 50 more times in simulation, each in a slightly different world, and keeps the runs that pass.

Right-click a passed try in Results and choose Multiply, or run it from ⌘K. Fine-tuning a model like GR00T takes hundreds of demonstrations. Each episode in a dataset used to be a try you drove by hand.

Each run moves the block and the spot up to 15 mm each way. It also varies friction, masses and servo strength the way Checks does. The arm's target moves with whichever object it was near, so the grip follows the block.

From one driven Pick Up a Block try on a six-joint arm, all 50 runs pass. Without moving the targets, 22 do. Runs go in background workers, and Stop in the toast ends them.

Generated tries fold into their try's row as a count, and Export Dataset writes one episode per pass. Tries recorded before today, and tries run by a trained policy, can't be multiplied. Steps are in [Multiply a try into varied demonstrations](/help/multiply-a-try-into-varied-demonstrations).
