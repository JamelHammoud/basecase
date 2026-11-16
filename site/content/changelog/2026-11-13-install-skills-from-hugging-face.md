---
title: Install skills from Hugging Face
date: 2026-11-13
image: /changelog/install-skills-from-hugging-face/ranked.png
---

You can now find skills ranked for your robot in Install Skill, then train one and check it in Arena. This works in the desktop app, the web studio and shared robot pages when browser training is supported.

A hexapod can start from a quad's standing policy instead of zero. Each leg takes the nearest source leg with as many joints.

Skills Basecase can install come first, then reported results on similar bodies, limb positions and source Arena passes determine their order. Skills it can't install appear last with their reason. Repo links also work.

Browser installation results survive reload. Desktop results stay on your computer and publish under your Hub account when signed in.

Failed Arena runs affect ranking. Cancellations and infrastructure failures don’t. Reports for another source commit or Arena version are ignored. Reported results never replace Arena on your robot.

The Motor Kit retrains the policy, and Arena runs 96 tries for Stand. The new skill keeps its own evidence and source skill hash. Ready skills can be published for other robots.

On shared robot pages, Try runs Stand, Get up or Settle, and Drive runs Walk. Open Scene carries the skill and target evidence into the studio.

![The hexapod's Case card with Install Skill](/changelog/install-skills-from-hugging-face/gallery.png)

Public installation needs no account. Install Skill takes Motor Kit skills on legged robots. Taught skills and moves don't install.

Read [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face) and [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face) in the help center for the steps.
