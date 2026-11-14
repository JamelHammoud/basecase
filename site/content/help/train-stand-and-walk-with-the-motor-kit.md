---
title: Train Stand and Walk with the Motor Kit
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 8
keywords:
  - motor kit
  - locomotion
  - gait
  - get up
  - settle
  - velocity tracking
  - walking policy
  - teach it to move
  - metal
  - gpu
  - webgpu
  - browser
related:
  - teach-a-robot-a-skill
  - arena
  - coach-a-skill
  - run-a-trained-skill-on-the-emulated-robot
covers:
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/TrainSection.tsx
  - src/components/simulate/ControlSection.tsx
  - src/skills/motorKit.ts
  - src/skills/skillRows.ts
  - src/workspace/useSkills.ts
  - src/skills/skillsPlatform.ts
  - src/forge/tabSupport.ts
  - src/gallery/GalleryCard.tsx
  - src/gallery/useGalleryTraining.ts
  - electron/trainer.mjs
  - electron/kitScheduler.mjs
  - forge/crates/forge-train/src/trainer.rs
---

The Motor Kit trains four basic skills for a robot that stands on its own legs: Stand, Walk, Get up and Settle. Basecase trains each one for you, with no goal to write, and proves it in Arena.

Training runs on your own GPU, in the desktop app or at app.basecase.so in Chrome or Edge.

To train a skill:

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, find **Stand**, **Walk**, **Get up** and **Settle**.

![The Train section with Stand, Walk, Get up and Settle](/help/train-stand-and-walk-with-the-motor-kit/rows.png)

3. Click **Train** on the skill you want.
4. Wait while the row shows the trainer's message and a progress bar. As the skill trains, the robot on the canvas runs its newest snapshot.

![Stand training at 25%](/help/train-stand-and-walk-with-the-motor-kit/training.png)

5. When the row shows its Arena line, such as "32 of 32 tries, at least 91%", click **Try** to run the skill in the simulation.
6. For **Walk**, click **Drive** instead of **Try**, then steer with [[W A S D]].

![Stand ready, with its Arena line and Try](/help/train-stand-and-walk-with-the-motor-kit/ready.png)

To stop training, click **Stop training** (■) on the row. For more on snapshots, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).

You can also train **Walk** with **Teach It to Move**, under **Control**.

Basecase discards a skill that fails Arena. The row tells you how close it came, such as "Refused in Arena: 20 of 32 tries", and offers **Train** so you can try again.

Only one skill trains at a time. Click **Train** on another skill and a message tells you which one is training. When training can't start, the row says why, for example "Training needs uv".

## In the browser

The **Train** section appears only if your browser can train on the GPU, and nothing trains until you click **Train**. A skill you train in the browser is saved with the scene in that browser, so it's still there after you reload the page.

When you open a gallery link to a legged robot, such as [the hexapod](https://app.basecase.so/c/hexapod-reach-the-flag), its Case card has a **Train** button that trains Stand. Once Stand passes Arena, the robot uses it to stand. Click **Open Scene** to open the robot in the studio with Stand ready.

![The hexapod's Case card with Stand ready](/help/train-stand-and-walk-with-the-motor-kit/gallery.png)

## How long it takes

In the desktop app on an M5 Pro Mac, training took about this long:

| Skill | Four or six legs | Two legs |
|---|---|---|
| **Stand** | About 2 minutes | 8 to 12 minutes |
| **Walk** | About 19 minutes | About 28 minutes |

In Chrome on the same Mac, Stand took about two and a quarter minutes.

When Walk fails Arena on its first try, Basecase retrains it from its best result. Retraining can take up to 30 minutes on four or six legs, and up to 45 minutes on two.

Stand and Walk train on the GPU on a Mac with Apple silicon. On Windows they train on the CPU, and the times above don't apply.

## What Walk can do

Walk follows the speed and turn you command. Its top speed is 0.2 m/s on four or more legs and 0.15 m/s on two. While you drive, Walk moves forward at up to its top speed, sideways at up to a quarter of it, and turns at up to 0.6 rad/s.

## One job at a time

The app runs one training job at a time, and any other jobs wait in a queue.

Training you start yourself goes to the front of the queue. A Motor Kit job that's retraining in the background pauses, and its row says "Paused for other training. Starts again after it."

## After you change the design

In the desktop app, Basecase checks each Motor Kit skill you've trained against the new design 1.5 seconds after you make an edit.

- After you change a color or a name, the skill stays ready.
- After you change a mass or a size, Basecase reruns Arena in the background without training.
- After you change a joint, Basecase trains the skill again.

A skill you haven't trained stays untrained until you start it.

If a ready skill moves in a way you don't want, like a Walk that drags its feet, see [Coach how a ready skill moves](/help/coach-a-skill). To share a ready skill, follow [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face). To start from someone else's skill, see [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face).

For what Arena checks, see [Arena](/help/arena). To teach a robot anything else, see [Teach a robot a skill](/help/teach-a-robot-a-skill). To run a ready skill on the emulated robot, see [Run a trained skill on the emulated robot](/help/run-a-trained-skill-on-the-emulated-robot).
