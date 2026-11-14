---
title: Drive a Case with your hand, face, MIDI or voice
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - hand tracking
  - face tracking
  - pan tilt
  - MIDI
  - MIDI keyboard
  - voice
  - speech
  - keyword
  - microphone
  - puppet
related:
  - run-a-case
  - drive-a-robot-with-your-camera
covers:
  - src/cameras/operator/handFollow.ts
  - src/cameras/operator/faceFollow.ts
  - src/cameras/operator/lookJoints.ts
  - src/cameras/operator/cameraSource.ts
  - src/midi/
  - src/voice/
  - src/sim/inputSources.ts
  - src/sim/inputEvents.ts
---

You can control a running Case with your hand, your face, a MIDI keyboard or your voice. Move your hand and an arm follows it like a puppet, or keep a camera head pointed at your face. MIDI notes and spoken words reach the Case's logic as events.

**Note:** These inputs need a running Case, and voice needs the desktop app.

1. In the **Agent** tab, ask for the Case and name the input you want to use. For example, “/case a pan-tilt camera that keeps my face centered”. The Case opens and starts running.

![The Puppet the Arm Case open, with You on the left, the arm in the middle and Try It on the right](/help/drive-a-case-with-your-hand-face-midi-or-voice/console.png)

2. Click **Try It**.
3. On your first try, allow Basecase to use the camera or the microphone.
4. Use the input the Case names (see the table below).

![A try 6.8 seconds in, with the computer's camera under You and the arm bent to the right](/help/drive-a-case-with-your-hand-face-midi-or-voice/hand.png)

For MIDI, plug in a keyboard or controller, or drop a `.mid` file on the canvas.

Press [[Esc]] to stop. Basecase turns off the camera and the microphone.

You can add the input to the Case's console in your `.basecase` file, the same way as in [Run a Case](/help/run-a-case).

## What each input does

| Input | Your move | Result |
|---|---|---|
| `hand` | Move one hand in front of the camera. Pinch your thumb and index finger. | A fixed arm's hand follows yours, scaled to the arm's reach. Move your hand 10 cm and the arm moves 18% of its reach. Pinch, and its gripper closes. |
| `face` | Sit in front of the camera. | A camera head turns its pan and tilt joints toward your face. |
| `midi` | Play a MIDI keyboard or controller, or drop a `.mid` file. | Each note sends the Case's logic the event `midi` with the note's number. Each knob or slider sends `midi.cc.` followed by its number, with a value from 0 to 1. |
| `voice` | Say a word the Case's logic listens for, such as “sit”. | The logic gets the event `voice` with that word. |

![A pan-tilt Case during a try, with the computer's camera under You and the camera head turned and tilted](/help/drive-a-case-with-your-hand-face-midi-or-voice/face.png)

Keep your hand still for a moment at the start. Basecase takes the rest position from your hand the first time the camera sees it, and moves the arm relative to that.

The face input looks for joints named pan and tilt. On a robot without them, it uses the two joints nearest the robot's camera and treats the one nearer the base as pan.

Basecase plays a dropped MIDI file from the start of each try, on the simulation's clock. Drop another file and it replaces the last one.

Voice recognizes single English words that the Case's logic names. The logic gets each word about a second after you stop speaking. Voice can mix up words that sound alike, such as “sit” and “set”.

The camera's picture and the microphone's sound stay on your computer, and Basecase never saves them.

To drive a robot with your whole body, see [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).
