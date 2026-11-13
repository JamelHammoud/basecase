---
title: Command Center
date: 2026-11-13
image: /changelog/command-center/cover.png
---

Open Command Center runs a Case as its own app in one window: the robot on the canvas, and around it whatever that Case needs to show, from camera feeds and live joint plots to a timer, a score and a Reset button.

## Where it is

Open a Case, then click the expand button in the Brief's header in the Simulate tab, or press ⌘K and choose Open Command Center. Done or Esc takes you back with the scene, the selection and the camera as they were.

![The Simulate tab with the Brief and its Open Command Center button](/changelog/command-center/brief.png)

## Built from the Case

A Case can carry a console that says how it runs. It lists its input sources (keys and a gamepad today), any signals of its own, its panels, and a layout of columns with widths, one of which is the canvas. A block game Case can put Time and Score on the left and Try It, Reset and the tries on the right; a rover Case, a big front camera on one side and a map on the other.

![A block game console during a try: Time counting down and Score left of the arm, and Try It, Reset and the running try on the right](/changelog/command-center/console.png)

Panels come in eight kinds: a camera, a value, a plot over time, a table, a button that runs an action (Try It, End Try, Drive, Stop Driving, Start Over or Reset), a list of tries or failures, text, and a top-down map with the robot's trail.

## What a panel can show

Every panel reads named live signals. Each joint has its target, position and effort. The robot has its height, tilt, speed, distance travelled and place on the floor, every probe of the Case reads live, every camera is there, and so is each input's stick and keys. While a try runs, the contract's verdict so far and its failures are signals too. A Case adds its own: a timer that counts down, a counter that ticks when a signal crosses a line, and a score that adds them up.

## Without a console

A Case without one opens with its cameras on the left, and the brief, the failures so far, the emulated robot's servos with the rung and Stop, and the tries on the right. Every Case you already have opens that way, and the Simulate tab no longer repeats the emulated robot's status.

![The Command Center with the arm, its Scene and Wrist Camera tiles, the brief, Connect Emulated Robot and Try It](/changelog/command-center/center.png)

## Not yet

A console can name the Mac's camera, a phone, MIDI, a leader arm, voice or a policy as its input, and this version refuses it with that reason.
