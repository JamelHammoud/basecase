---
title: Install a skill from Hugging Face
date: 2026-11-13
collection: simulate-and-train
type: task
order: 15
keywords:
  - hf
  - hub
  - download
  - import skill
  - warm start
  - transfer
  - motor kit
  - policy
related:
  - publish-a-skill-to-hugging-face
  - arena
covers:
  - src/components/InstallSkillSheet.tsx
  - src/workspace/useSkillHub.ts
  - src/workspace/skillCommands.tsx
  - src/skills/hubSkill.ts
  - src/skills/robotSchema.ts
  - src/skills/policyMap.ts
  - src/skills/motorKit.ts
  - electron/hub/
---

Start your robot from a skill someone published, then train it on your robot and prove it in Arena before it counts as ready.

Install Skill works in the desktop app, on legged robots. It takes Motor Kit skills: Stand, Walk, Get up and Settle.

1. Open your robot and the **Simulate** tab.
2. Press [[⌘K]] and choose **Install Skill**.

![Install Skill in the command palette](/help/install-a-skill-from-hugging-face/command.png)

3. Paste the skill's Hugging Face link into **Skill link**, and press Enter.

![The Install Skill sheet with a repo link](/help/install-a-skill-from-hugging-face/link.png)

4. Wait for the skill's row under **Train** to finish training. It shows Arena's result when it's ready.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

## What happens

Basecase downloads the skill's files and checks each one against `skill.json`. A file that doesn't match stops the install, and the toast names it.

The skill's legs are matched to yours. Each of your legs takes the nearest leg with as many joints, so a four-legged Stand fits a hexapod. Legs with a different number of joints don't fit, and the toast says how many each has.

Then the Motor Kit trains the skill on your robot, starting from the published policy. Arena judges the result on your robot's physics. Your skill keeps its own evidence, never the author's, and remembers which skill it started from.

If Arena refuses the result, nothing is saved. The row says "Refused in Arena" with its worst run's count, and **Train** starts over from scratch.

To see what Arena checks, read [Arena](/help/arena).
