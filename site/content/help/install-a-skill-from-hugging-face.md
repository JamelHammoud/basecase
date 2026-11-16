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

Install Skill works on legged robots in the desktop app and in browsers that support training. It takes Motor Kit skills: Stand, Walk, Get up and Settle. You don't need to sign in to Hugging Face to install a public skill.

Browser downloads support regular Hub files. A download redirect the browser can’t inspect is refused. Use the desktop app for those repos.

1. In Basecase, open your robot.
2. In your robot's scene, open the **Simulate** tab.
3. In the command palette ([[⌘K]]), choose **Install Skill**.

![Install Skill in the command palette](/help/install-a-skill-from-hugging-face/command.png)

4. In the published skills list, click **Install** beside the skill you want.

![Install Skill with published Stand skills ranked for the open quad and a refused biped skill](/help/install-a-skill-from-hugging-face/ranked.png)

5. Under **Train**, wait for the skill's row to finish training and show its Arena result.

![The hexapod's Stand row ready after installing](/help/install-a-skill-from-hugging-face/installed.png)

You can also right-click a row under **Train** and choose **Install Skill**. In **Install Skill**, you can paste a repo link into the field and press [[↩]] instead.

The list puts skills Basecase can install first, then uses reported installation results on similar robot bodies, limb positions and the source's Arena passes. Skills it can't install appear last with their reason. Repos whose policy or Arena evidence doesn't match `skill.json` are left out. If the Hub can't be reached, the list is empty and you can still enter a link.

If a file doesn't match `skill.json`, the install stops and a toast shows the name of the file. Legs with a different number of joints don't fit, and the toast says how many joints each one has.

Browser installation results stay in this browser and survive reload. Desktop installation results are saved on your computer. On desktop, while signed in, Basecase also publishes them under your own Hugging Face account. Pending results publish when you next open **Install Skill** or finish an installation while signed in. Failed Arena runs count as failures. Canceled attempts and infrastructure failures don’t affect ordering. Reports must match the source commit and current Arena version. Other people’s reports help order the list but don’t prove your installation.

The author's Arena evidence doesn't carry over, so your installed skill needs its own. Installed Walk and Settle candidates also face the same required starts and stops as locally trained candidates.

If Arena refuses the candidate, its row shows "Refused in Arena" with its worst count. A failed start or stop names the switch and movement that failed. Basecase keeps the previous passing skill available, with the refusal above its Arena result. Without a previous skill, the row offers **Train** again.

## On a shared robot page

1. In the robot's Case card, click **Install Skill**.

![The hexapod's Case card with Install Skill](/help/install-a-skill-from-hugging-face/gallery.png)

2. In the published skills list, click **Install** beside a fitting skill.
3. In the Case card, wait for the skill's row to show its Arena result.
4. In the ready row, click **Try** or **Drive** to run the skill.

5. In the Case card, click **Open Scene** to keep the skill in the studio.

Walk uses **Drive**. Stand, Get up and Settle use **Try**.

To learn what Arena checks, see [Arena](/help/arena).
