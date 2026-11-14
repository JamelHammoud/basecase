---
title: Drive a robot with your phone
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - phone
  - iphone
  - android
  - tilt
  - qr code
  - teleop
  - remote
related:
  - drive-a-robot-in-the-simulation
  - try-a-case
covers:
  - src/phone/phoneDrive.ts
  - src/phone/phoneStore.ts
  - src/phone/phoneLink.ts
  - src/components/phone/PairPhoneHost.tsx
  - src/workspace/inputCommands.tsx
  - electron/phone/phonePairing.mjs
  - electron/phone/phonePage.mjs
---

You can steer a rover, a walking robot or an arm in the simulation by tilting your phone. The page on your phone has a touch pad and two buttons too.

Pairing works in the desktop app. You need a robot in the scene, and your phone needs to be on the same network as your computer. The web studio can't open a network socket, so it doesn't offer pairing.

1. Press [[⌘K]].
2. Choose **Pair Phone**.

![Pair Phone in ⌘K, with a rover in the scene](/help/drive-a-robot-with-your-phone/command.png)

3. Scan the code with your phone's camera.

![The pairing code over the canvas](/help/drive-a-robot-with-your-phone/code.png)

4. On your phone, open the link.
5. Continue past the warning that says the connection isn't private.

![The phone's page: Tilt to drive, a touch pad, and the A and B buttons](/help/drive-a-robot-with-your-phone/phone.png)

6. Tap the page once.
7. On an iPhone, allow access to motion and orientation.
8. On your computer, click **Simulate** at the top of the right panel.
9. In **Control**, click **Drive**.
10. To go forward, tilt the top of the phone down. To turn left, tilt its left edge down.

Your phone shows the warning because Basecase makes a new certificate for each pairing, so no browser recognizes it. The code on your computer goes away as soon as your phone connects.

When you're done, press [[⌘K]] and choose **Unpair Phone**. To stop pairing while the code is showing, press [[Esc]]. If no phone connects within 5 minutes, the pairing ends.

## What each input does

| Input | Rover | Walking robot | Arm |
|---|---|---|---|
| Tilt forward and back | Drive forward and back | Walk forward and back | Move the hand forward and back |
| Tilt left and right | Turn | Turn | Move the hand left and right |
| Touch pad, sideways | | Step sideways | |
| Touch pad, up and down | | | Raise and lower the hand |
| A | | | Close the gripper |

The phone counts as still when you hold it within 4° of level. A tilt of 25° is full speed. If the phone locks or the page closes, the robot stops within half a second. Closing the page also ends the pairing.

While a connected phone is tilted, it takes over from a gamepad and the keys.

Each press of A or B also counts as an event named `phone` with the value `a` or `b`. A Case's logic can react to these events, as in [Build a routine](/help/build-a-routine).
