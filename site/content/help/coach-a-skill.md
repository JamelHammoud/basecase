---
title: Coach how a ready skill moves
date: 2026-11-13
updated: 2026-11-14
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
  - src/components/simulate/skillMenu.tsx
  - src/workspace/useSkillCoach.ts
  - src/workspace/coachCommands.tsx
  - src/workspace/agentCoachRequests.ts
  - electron/cad-mcp/skillTools.mjs
---

Coaching changes how a passing Motor Kit skill moves. You can ask it to lift its feet or land softly, for example. Arena judges the coached skill the same way it did before.

You can coach Stand, Walk, Get up and Settle in the desktop app once they're ready.

1. Open the **Simulate** tab and find the ready skill under **Train**.
2. Right-click the skill's row, then choose **Coach**.

![The right-click menu of a ready Stand row with Stress, Coach and Publish to Hugging Face](/help/coach-a-skill/menu.png)

3. The field now shows the skill's name. Type how you want the skill to move, then press [[↩]]. The **Agent** tab opens with what you typed.

![The Teach field scoped to Stand, with crouch lower typed in](/help/coach-a-skill/field.png)

4. Wait for the agent to report back.
5. Open the **Simulate** tab again. The row shows its Arena result and the measurement before and after, for example, 130 → 119 mm. Click **Try** to play the version the skill kept.
6. To play the old skill and then the new one on the canvas, right-click the row and choose **Compare**.

![A coached Stand row with its base height before and after, and its menu with Coach, Compare and Undo Coach](/help/coach-a-skill/coached.png)

The agent changes only the skill's reward, and Forge trains from the skill as it is. The agent names one of five measurements: foot clearance, contact impulse, joint jerk, base height or speed.

The new version replaces the old one only if Arena passes it on the same contract and the measurement the agent named moves by at least its minimum. If not, the old skill stays and the agent tells you why. If a design change retrains the skill in the background, the skill loses its coaching.

To go back to the version before, right-click the row and choose **Undo Coach**. To teach a new skill instead, press [[Esc]] in the field.

In [[⌘K]], **Coach Walk**, **Compare Walk** and **Undo Coach Walk** do the same as their menu items.

To learn how Arena judges a skill, see [Arena](/help/arena).
