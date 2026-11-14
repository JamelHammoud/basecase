---
title: Share a robot as a link
date: 2026-11-13
image: /changelog/share-a-robot-as-a-link/cover.png
---

Share Robot turns the robot and its open Case into a link, app.basecase.so/r/your-name/your-robot. Anyone can open it in a browser to drive the robot and open it in the studio.

## Where it is

Open a Case in the Simulate tab. Share Robot sits in Results, under Export Dataset and Publish to Hugging Face when a try has passed, and on its own before that. The same command is in ⌘K. It's in the desktop app, and it uses the Hugging Face account in **Settings** ▸ **Accounts**. The first time, it opens that pane for a token with write access.

Steps are in [Share a robot as a link](/help/share-a-robot-as-a-link).

![Results with Share Robot, in a scene with Reach the Flag open](/changelog/share-a-robot-as-a-link/results.png)

![⌘K with Share Robot as the first match](/changelog/share-a-robot-as-a-link/command.png)

## What happens

Basecase saves the robot's parts and joints, the Case and the newest policy or skill that passed into one file, basecase-robot.json. The file goes in a public dataset repo on your account named after the scene. Parts whose models only live on your computer, like ones the agent sourced, go in as the triangles you see in the canvas. The link goes on the clipboard and the toast says Link copied. Sharing the same Case from the same scene again updates that repo, so the link stays the same.

![The Link copied toast above the toolbar](/changelog/share-a-robot-as-a-link/cover.png)

## What the link opens

The link opens a page with the robot in its Case's world, the Case's name and brief, Drive and Open Scene. Drive runs the simulation in the tab with the keyboard, the same as the example Cases on app.basecase.so. Open Scene opens the robot in the browser studio, with the Case and the trained policy or skill.

A Case with its own console opens as that Case's app, the way Run Case shows it in the studio. Its panels sit around the robot and its code panels work, so a shared joystick drives the rover. Camera panels, the servos table and the tries list stay in the studio. Steps are in [Run a Case](/help/run-a-case).

![A shared rover Case in the browser, with speed and tilt over the robot and a joystick on the right](/changelog/share-a-robot-as-a-link/app.png)

A legged robot's link also shows Train in Chrome and Edge. It trains Stand on the visitor's GPU, and Open Scene then opens the robot with Stand ready. Steps are in [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

![The shared rover in the browser with Drive and Open Scene](/changelog/share-a-robot-as-a-link/browser.png)

## Limits

The file has to stay under 8 MB, or Share Robot says it couldn't share the robot and why. The page only reads the file from huggingface.co. Phones get the landing page instead, as with every app.basecase.so link.
