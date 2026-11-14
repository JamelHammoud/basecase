---
title: Share a robot as a link
date: 2026-11-13
image: /changelog/share-a-robot-as-a-link/cover.png
---

You can now turn a robot and its open Case into a link with Share Robot, like app.basecase.so/r/your-name/your-robot. Anyone who opens it in a browser can drive the robot and open it in the studio.

## Where it is

Open a Case in the Simulate tab. Share Robot is in Results. Once a try has passed, it sits under Export Dataset and Publish to Hugging Face. Before that, it's there on its own. You can also run it from ⌘K.

Share Robot is in the desktop app, and it uses the Hugging Face account in **Settings** ▸ **Accounts**. The first time, it opens that pane so you can add a token with write access.

Read [Share a robot as a link](/help/share-a-robot-as-a-link) for the steps.

![Results with Share Robot, in a scene with Reach the Flag open](/changelog/share-a-robot-as-a-link/results.png)

![⌘K with Share Robot as the first match](/changelog/share-a-robot-as-a-link/command.png)

## What happens

Basecase saves the robot's parts and joints, the Case, and the newest policy or skill that passed into one file, basecase-robot.json. The file goes in a public dataset repo on your account, named after the scene.

Some parts have models that only live on your computer, like the ones the agent sourced. Those go in as the triangles you see in the canvas.

The link goes on your clipboard and the toast says Link copied. If you share the same Case from the same scene again, Basecase updates that repo, so the link stays the same.

![The Link copied toast above the toolbar](/changelog/share-a-robot-as-a-link/cover.png)

## What the link opens

The link opens a page with the robot in its Case's world. It shows the Case's name and brief, and two buttons, Drive and Open Scene.

Drive runs the simulation in the tab, and you drive with the keyboard, the same as the example Cases on app.basecase.so. Open Scene opens the robot in the browser studio, with the Case and the trained policy or skill.

If the Case has its own console, the link opens it as that Case's app, the way Run Case shows it in the studio. The panels sit around the robot and the code panels work, so a shared joystick drives the rover. Camera panels, the servos table and the tries list stay in the studio. Read [Run a Case](/help/run-a-case) for the steps.

![A shared rover Case in the browser, with speed and tilt over the robot and a joystick on the right](/changelog/share-a-robot-as-a-link/app.png)

In Chrome and Edge, a legged robot's link also shows Train, which trains Stand on the visitor's GPU. Open Scene then opens the robot with Stand ready. Read [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit) for the steps.

![The shared rover in the browser with Drive and Open Scene](/changelog/share-a-robot-as-a-link/browser.png)

## Limits

The file has to stay under 8 MB. If it's bigger, Share Robot tells you it couldn't share the robot, and why.

The page only reads the file from huggingface.co. On a phone, the link opens the landing page instead, like every app.basecase.so link.
