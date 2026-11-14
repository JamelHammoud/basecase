---
title: Train animations as moves
date: 2026-11-13
---

You can now train any animation of a legged robot as a move, and Forge learns to perform it under physics. A quadruped can sit and hold, a hexapod can dance to a beat, and a biped can bow without tipping over.

## Where it is

Every animation in the Pose tab shows up as a row in Simulate's Train section, below Stand, Walk, Get up and Settle. The row is named after the animation. Click Train to start training it, and Try to play it once it passes.

The agent can train one too. Ask it for a wave or a bow, and it animates the robot and trains the move.

## How it works

Until now, an animation played in the sim as joint targets. That works for an arm bolted to a table, but a robot on legs falls over when a squat or a bow shifts its weight.

A move is a policy trained to follow the animation. It reads the robot's state and a clock that runs at the animation's own period. Forge rewards it for keeping every joint on the animation while the robot stays upright and moves smoothly.

Arena then judges the move against the animation itself, in three runs of 32 tries. It randomizes friction, masses and servo strength, then halves the timestep, then adds servo delays of up to 40 ms. A move passes with 29 of 32 in every run.

Each joint has to stay within about 14° of where the animation puts it, give or take 0.2 s, and the robot can't fall or drift more than 30 cm.

A move that doesn't loop also has to hold its last pose for 2 s. A robot that only holds still never passes, and an animation that barely moves stays an animation.

## What changes when you edit it

Edit the animation and its row goes back to Train, since the policy learned the old version.

Change the robot itself and the moves you've already trained retrain in the background, the same way Stand and Walk do.

## In a Routine

A Routine or Case logic can switch from Walk or Settle straight into a move, or into a skill you taught from a sentence. The switch runs 8 times in simulation first, as in [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).

## What it doesn't do

The Robot Package doesn't call moves. Filming yourself and turning the clip into an animation is the next step.

Read [Train an animation as a move](/help/train-an-animation-as-a-move) in the help center for the steps.
