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
  - src/skills/skillRank.ts
  - src/skills/findSkills.ts
  - src/skills/motorKit.ts
  - electron/cad-mcp/skillTools.mjs
  - electron/hub/
hub_the_design_agent_order: 15
hub_the_design_agent: |
  - Ask it to find published skills for the open robot. It ranks them as Install Skill does and gives a reason for each skill it can't install.
---

Start your robot from a published skill that Basecase retrains on your robot and checks in Arena.

Install Skill works in the desktop app, on legged robots. It takes Motor Kit skills: Stand, Walk, Get up and Settle. You don't need to sign in to Hugging Face to install a public skill.

1. In Basecase, open your robot.
2. In your robot's scene, open the **Simulate** tab.
3. In the command palette ([[⌘K]]), choose **Install Skill**.

![Install Skill in the command palette](/help/install-a-skill-from-hugging-face/command.png)

4. In the published skills list, click **Install** beside the skill you want.

![Install Skill with published Stand skills ranked for the open quad and a refused biped skill](/help/install-a-skill-from-hugging-face/ranked.png)

5. Under **Train**, wait for the skill's row to finish training and show its Arena result.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

You can also right-click a row under **Train** and choose **Install Skill**. In **Install Skill**, you can paste a repo link into the field and press [[↩]] instead.

The list puts skills Basecase can install first, then compares limb positions, then the source's Arena passes. Skills it can't install appear last with their reason. Repos whose policy or Arena evidence doesn't match `skill.json` are left out. If the Hub can't be reached, the list is empty and you can still enter a link.

If a file doesn't match `skill.json`, the install stops and a toast shows the name of the file. Legs with a different number of joints don't fit, and the toast says how many joints each one has.

The author's Arena evidence doesn't carry over, so your installed skill needs its own. If Arena refuses the skill, Basecase doesn't save anything, and the row shows "Refused in Arena" with its worst count.

To learn what Arena checks, see [Arena](/help/arena).
