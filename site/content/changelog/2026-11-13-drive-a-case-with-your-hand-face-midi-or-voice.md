---
title: Drive a Case with your hand, face, MIDI or voice
date: 2026-11-13
image: /changelog/drive-a-case-with-your-hand-face-midi-or-voice/cover.png
---

You can now puppet an arm with your hand and aim a camera head at your face. A Case's logic can also hear MIDI notes and, in the desktop app, spoken words.

A Case's console lists the inputs that drive it. Four new ones join the keys, the gamepad, the phone and the body camera: `hand`, `face`, `midi` and `voice`.

It started with a robot dog that should sit when you say “sit”. Until now, nothing in Basecase could hear a word or read a MIDI note.

## Hand and Face

Your hand moves a fixed arm's hand, starting from wherever your hand was and scaled to the arm's reach. Move your hand 10 cm and the arm's hand moves 18% of its reach. Pinch, and its gripper closes.

Your face turns a pan-tilt head toward you.

Hand and face share one camera stream with the body input.

## MIDI

Each note you play sends the logic `midi` with the note's number, and each knob sends a value from 0 to 1.

Drop a `.mid` file on the canvas and it plays on the simulation's clock.

## Voice

Voice listens on your computer for the words the Case's logic names. Each word arrives about a second after you stop speaking. The model is 41 MB, and no sound is saved.

Voice only hears single English words, and it can mistake “set” for “sit”.

Read [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice) in the help center for the steps.
