---
title: Install a skill from Hugging Face
date: 2026-11-13
updated: 2026-11-14
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

You can start your robot from a skill that someone else has published. Basecase trains the skill on your robot, then checks it in Arena before it counts as ready.

Install Skill works in the desktop app, on legged robots. It takes Motor Kit skills: Stand, Walk, Get up and Settle. You don't need to sign in to Hugging Face to install a public skill.

1. Open your robot, then open the **Simulate** tab.
2. Press [[⌘K]] and choose **Install Skill**.

![Install Skill in the command palette](/help/install-a-skill-from-hugging-face/command.png)

3. Paste the skill's Hugging Face link into the field, then press [[↩]].

![The Install Skill sheet with a repo link](/help/install-a-skill-from-hugging-face/link.png)

4. Wait for the skill's row under **Train** to finish training. When the skill is ready, its row shows the result from Arena.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

If a file doesn't match `skill.json`, the install stops and a toast shows the name of the file. Legs with a different number of joints don't fit, and the toast says how many joints each one has.

The author's Arena evidence doesn't carry over, so your installed skill needs its own. If Arena refuses the skill, Basecase doesn't save anything, and the row shows "Refused in Arena" with its worst count.

To learn what Arena checks, see [Arena](/help/arena).
