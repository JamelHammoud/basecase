---
title: Coach how a ready skill moves
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - coach
  - /coach
  - style
  - reward
  - fine-tune
related:
  - teach-a-robot-a-skill
  - arena
covers:
  - src/skills/coach.ts
  - src/skills/coachPrompt.ts
  - src/skills/coachSignals.ts
  - src/skills/skillsCoach.ts
  - src/components/simulate/TrainSection.tsx
  - src/components/simulate/skillMenu.ts
  - src/workspace/useSkillCoach.ts
  - src/workspace/agentCoachRequests.ts
  - electron/cad-mcp/skillTools.mjs
---

Change how a passing Motor Kit skill moves, such as lifting its feet or landing softly, without changing what Arena judges it on.

Coaching works on Stand, Walk, Get up and Settle once they're ready, in the desktop app.

1. Open the **Simulate** tab and find the ready skill under **Train**.
2. Right-click its row and choose **Coach**.

![The right-click menu of a ready Stand row with Coach](/help/coach-a-skill/menu.png)

3. Type how it should move into the field, which now shows the skill's name, and press Enter. The **Agent** tab opens with your words.

![The Teach field scoped to Stand, with crouch lower typed in](/help/coach-a-skill/field.png)

4. Wait for the agent to report back. It reads five measurements of one clean run, rewrites only the skill's reward and trains from the skill as it is.
5. Open the **Simulate** tab again. The row shows its Arena result, and **Try** plays the version that's kept.
6. Right-click the row and choose the two numbers, such as **130.0 mm → 118.7 mm**, to play the old skill and then the new one on the canvas.

![The menu of a coached Stand row with its base height before and after, and Undo Coach](/help/coach-a-skill/coached.png)

The new version is kept only if Arena passes the same contract and the measurement the agent named moved by its minimum. Otherwise the old skill stays, and the agent says why.

To go back to the version before, right-click the row and choose **Undo Coach**. Press Esc in the field to teach a new skill instead. In ⌘K, **Coach Walk** and the other ready skills do the same as step 2.

The five measurements are foot clearance, contact impulse, joint jerk, base height and speed. A design change that retrains the skill in the background drops its coaching. How Arena judges a skill is in [Arena](/help/arena).
