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

3. Paste the skill's Hugging Face link into the field, and press [[↩]].

![The Install Skill sheet with a repo link](/help/install-a-skill-from-hugging-face/link.png)

4. Wait for the skill's row under **Train** to finish training. It shows Arena's result when it's ready.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

A file that doesn't match `skill.json` stops the install, and the toast names it. Legs with a different number of joints don't fit, and the toast says how many each has.

Your skill keeps its own Arena evidence, never the author's. If Arena refuses it, nothing is saved, and the row shows "Refused in Arena" with its worst count.

[Arena](/help/arena) explains what it checks.
