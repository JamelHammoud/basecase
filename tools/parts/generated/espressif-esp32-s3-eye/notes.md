# Espressif ESP32-S3-EYE

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/espressif-esp32-s3-eye/.

Envelope: 61 × 12.3 × 30 mm (studio frame, Y up).

The model matches every number in record.json, so I changed nothing; it's ready to save. I checked it with get_scene, check_scene and top and side renders.

The record gives very few numbers: the board outline, the notch, the sub board's size, an approximate camera position, and a note that there are no dimensioned mounting holes. It has no shaft, spline, boss, horn or tab-height values. All measurements below are taken from part positions and bounding boxes, in the model's frame: the 60 mm side runs along X with the notched camera end at +X, and the main board's bottom face is at z = 0.

| Feature (record.json) | Official | Measured on model | Result |
|---|---|---|---|
| Envelope x (board width) | 30 | Main board y −15 to 15 = 30.0 | OK |
| Envelope y (board length) | 60 | Main board x −30 to 30 = 60.0 | OK |
| Envelope z (stack height) | not published | −3.1 to 9.2 = 12.3 (estimated) | no official value |
| Camera-end notch width | 18.00 | y −9 to 9 = 18.0 | OK |
| Notch depth | 6.40 | x 23.6 to 30 = 6.4 | OK |
| Tabs either side of the notch | 6.00 each | y 9 to 15 and −15 to −9 = 6.0 each | OK |
| Main board outline with notch, cross-check | 60 × 30 minus 18 × 6.4 | volume 2696 mm³ = (1800 − 115.2) × 1.6 | OK |
| Sub board size | 30.00 × 31.90 | y 30.0 × x 31.9 (−22.1 to 9.8) | OK |
| Sub board stacked on the main board via J8/J9 | stacked via J8/J9 + J5 | Main board headers 1.6–3.6 meet sub headers 3.6–5.6, which meet the sub board bottom at 5.6 | OK |
| Camera position | centerline, about 10.8 below the notched end | lens at y = 0, 30 − 19.2 = 10.8 from the end | OK |
| Mounting holes | none dimensioned | none modeled | OK |
| Overall length including connector | 60 board | 61, because the Micro-USB sticks out about 1.0 mm past the edge, as the bottom drawing shows | OK (intended) |

**Seating check:**
- **Top side:** the camera, the buttons, the camera FPC connector and the main board headers all start exactly on the board's top face (z = 1.6).
- **Underside:** the module, the microSD slot and the Micro-USB top out exactly at the board's bottom face (z = 0).
- **Sub board:** the LCD sits on its top face (z = 7.2), and J5 hangs from its underside (z = 5.6).
- **Camera:** its body (x 14.95–23.45) stays on the board and clear of the notch, which starts at x = 23.6.
- **Module:** its antenna end overhangs the notch, as the bottom drawing shows.
- **Clashes:** nothing is buried inside another part, nothing floats, and check_scene finds no interferences.
- **check_scene warnings:** the only ones are the three underside parts "below the floor". That's expected, because the board's bottom face is at z = 0 as you asked.

**Not dimensioned** (estimated, kept as plain blocks):
- **Board thicknesses:** both PCBs are set to 1.6 mm.
- **Stack height:** the header pairs are 2.0 + 2.0 mm, so the gap between the boards is 4.0 mm.
- **LCD:** a plain 26 × 26 × 2 mm block; the sources give no size or position.
- **Component heights:** module 3.1, microSD 1.6, Micro-USB 2.5, camera 4.5 including a Ø7 lens, buttons 1.5, FPC connectors 1.5.
- **Positions scaled from the drawings (about ±0.3 mm):**
  - camera body
  - buttons (MENU, PLAY, UP+, DN−, BOOT, RST)
  - camera FPC connector
  - J8/J9 headers
  - sub board position along the length
  - J5 connector
  - module length
  - microSD footprint
  - Micro-USB footprint and how far it sticks out
- **Sub board orientation:** I matched the J8/J9 header centers, but which side J5 sits on depends on how the sub-board drawing is flipped.
- **Tab features:** the two round features in the tabs appear only in the top drawing, so they aren't through-holes and aren't modeled.
- **Left out:** corner radii, the battery pads, and the camera and LCD flex cables.
