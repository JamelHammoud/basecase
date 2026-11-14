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

You can start your robot from a skill that someone else published. Basecase trains the skill on your robot, then runs it in Arena. The skill is ready only after it passes.

**Note:** Install Skill works in the desktop app, with legged robots. It accepts Motor Kit skills: Stand, Walk, Get up and Settle.

1. Open your robot, then open the **Simulate** tab.
2. Press [[⌘K]] and choose **Install Skill**.

![Install Skill in the command palette](/help/install-a-skill-from-hugging-face/command.png)

3. Paste the skill's Hugging Face link into the field, then press [[↩]].

![The Install Skill sheet with a repo link](/help/install-a-skill-from-hugging-face/link.png)

4. Wait for the skill's row under **Train** to finish training. When it's ready, the row shows Arena's result.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

If a file doesn't match `skill.json`, the install stops and a toast names the file. The skill also won't fit legs with a different number of joints. In that case, the toast says how many joints each one has.

Arena tests the skill on your robot and keeps its own evidence for it. Evidence from the skill's author doesn't carry over. If Arena refuses the skill, Basecase saves nothing, and the row shows "Refused in Arena" with its worst count.

To learn what Arena checks, see [Arena](/help/arena).
