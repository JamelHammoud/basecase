---
title: Train animations as moves
date: 2026-11-13
image: /changelog/train-animations-as-moves/cover.png
---

Any animation of a legged robot can now be trained as a move: Forge learns to perform it under physics, so a quadruped can sit and hold, a hexapod can dance to a beat and a biped can bow without tipping over.

## Where it is

Every animation in the Pose tab shows up as a row in Simulate's Train section, named after the animation, below Stand, Walk, Get up and Settle. Train starts it, Try plays it once it passes. The agent can train one too: ask it for a wave or a bow, and it animates the robot and trains the animation as a move.

![The Train section with Sit ready and Try](/changelog/train-animations-as-moves/ready.png)

## How it works

Until now an animation played in the sim as joint targets. That's fine for an arm bolted to a table, but a robot on legs falls over the moment a squat or a bow shifts its weight. A move is a policy trained to follow the animation instead: it reads the robot's state and a clock that runs at the animation's own period, and it's rewarded for keeping every joint on the animation while staying upright and smooth.

Arena then judges it against the animation itself, in three runs of 32 tries: randomized friction, masses and servo strength, the same at half the timestep, and servo delays up to 40 ms. It passes with 29 of 32 in every run. Each joint has to stay within about 14° of where the animation puts it, give or take 0.2 s, and the robot mustn't fall or drift more than 30 cm. A move that doesn't loop also has to hold its last pose for 2 s. Holding still never passes, and an animation that barely moves stays an animation.

## What changes when you edit it

Editing the animation puts its row back to Train, since the policy learned the old one. A change to the robot itself retrains moves you've trained before in the background, the same way it does Stand and Walk.

## What it doesn't do yet

Routines and the Robot Package don't call moves yet, and a move doesn't blend into Walk. Filming yourself and turning the clip into an animation is the next step.
