---
title: Train animations as moves
date: 2026-11-13
---

Any animation of a legged robot can now be trained as a move, which Forge learns to perform under physics. A quadruped can sit and hold, a hexapod can dance to a beat and a biped can bow without tipping over.

## Where it is

Every animation in the Pose tab shows up as a row in Simulate's Train section, below Stand, Walk, Get up and Settle. The row is named after the animation. Train starts it, and Try plays it once it passes. The agent can train one too: ask it for a wave or a bow, and it animates the robot and trains the move.

## How it works

Until now an animation played in the sim as joint targets. That's fine for an arm bolted to a table, but a robot on legs falls over when a squat or a bow shifts its weight. A move is a policy trained to follow the animation instead. It reads the robot's state and a clock that runs at the animation's own period. It's rewarded for keeping every joint on the animation while staying upright and smooth.

Arena then judges it against the animation itself, in three runs of 32 tries. The runs randomize friction, masses and servo strength, then halve the timestep, then add servo delays up to 40 ms. It passes with 29 of 32 in every run. Each joint has to stay within about 14° of where the animation puts it, give or take 0.2 s. The robot mustn't fall or drift more than 30 cm.

A move that doesn't loop also has to hold its last pose for 2 s. Holding still never passes, and an animation that barely moves stays an animation.

## What changes when you edit it

Editing the animation puts its row back to Train, since the policy learned the old one. A change to the robot itself retrains moves you've trained before in the background, the same way it does Stand and Walk.

## In a Routine

A Routine or Case logic can switch from Walk or Settle straight into a move, or into a skill you taught from a sentence. The switch runs 8 times in simulation first, as in [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).

## What it doesn't do

The Robot Package doesn't call moves. Filming yourself and turning the clip into an animation is the next step.

Steps are in [Train an animation as a move](/help/train-an-animation-as-a-move).
