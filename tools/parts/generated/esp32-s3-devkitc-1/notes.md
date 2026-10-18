# Espressif ESP32-S3-DevKitC-1

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/esp32-s3-devkitc-1/.

Envelope: 70.02 × 13.2 × 25.4 mm (studio frame, Y up).

Every dimension in record.json matches the model, so I didn't change anything. I read the values from get_scene part positions and sizes, then reran check_scene and looked from three angles.

Model frame: long side along X, USB edge at X = −31.37, antenna end at +31.37. A record coordinate y (along the length) is X − (−31.37); a record coordinate x (across the width) is 12.7 − Y.

| Record item | Official value | Measured on model | Result |
|---|---|---|---|
| Envelope x (width) | 25.40 | PCB Y −12.70 to 12.70 = 25.40 | OK |
| Envelope y (length) | 62.74 | PCB X −31.37 to 31.37 = 62.74 | OK |
| Envelope z | not published | PCB 1.6 (assumed), parts on top reach z = 4.7 | — |
| Mounting holes | none | none | OK |
| Header row 1 (x = 1.27) | 1.27 | Y = +11.43, which is 1.27 in from the +Y edge | OK |
| Header row 2 (x = 24.13) | 24.13 | Y = −11.43, which is 24.13 from the +Y edge | OK |
| Row spacing | 22.86 | 11.43 + 11.43 = 22.86 | OK |
| Pin pitch / count | 2.54 / 2 × 22 | 2.54 / 2 × 22, in both headers and the PCB holes | OK |
| First pin from the USB edge | 7.96 | −23.41 + 31.37 = 7.96 | OK |
| Last pin from the USB edge | 61.30 | 29.93 + 31.37 = 61.30 | OK |
| Module width / across-board span | 18.0, x 3.75–21.75 | Y −9.05 to 8.95, i.e. x 3.75–21.75 | OK |
| Module far end | y = 69.15 (6.41 past the PCB) | X max 37.78, i.e. 69.15 (6.41 past the PCB) | OK |
| USB J2 / J4 overhang | 0.87 past the y = 0 edge | X min −32.24, i.e. 0.87 past the edge, both connectors | OK |
| USB position | on the y = 0 edge, type not stated | both sit on the edge; centres scaled off the drawing | OK (approx.) |

**How the parts sit:**
- **PCB:** bottom face at z = 0.
- **Module and USB connectors:** their bottoms sit on the PCB top face at z = 1.6. The module's antenna end extends 6.41 mm past the PCB edge, like the real board.
- **Headers:**
  - The plastic body sits against the PCB underside (z −2.5 to 0).
  - The pins run up through the Ø1.0 holes and end flush with the PCB top. A 0.64 mm square pin is 0.905 mm across the corners, so it fits the hole without overlapping the board.
- **Overlaps and gaps:** no parts overlap and nothing floats. The headers at |Y| ≥ 10.16 stay clear of the module and the USB connectors at |Y| ≤ 10.8 sit above them, not inside.

**check_scene** reports one issue: both header strips go 8.5 mm below the floor. That is deliberate: the board ships with its pins pointing down. Every other part is above z = 0, so if you need the library part entirely above the floor, delete the two headers.

**Not dimensioned** (kept plain, or left out):
- **PCB thickness:** 1.6 mm assumed. Every height above z = 0 depends on it.
- **Through-hole drill:** Ø1.0 assumed. The hole positions come from the record.
- **USB receptacles J2/J4:** the connector type isn't given. Each is a plain 8.0 × 6.87 × 3.0 mm block. Width, depth and centres (Y = +6.8 / −6.7) were scaled off the drawing and are good to about ±0.3 mm; the height is assumed.
- **Module height and length:** 3.1 mm and 25.5 mm come from the WROOM-1 datasheet linked in the record, not the board drawing. The module is one plain block with no shield-can or antenna detail.
- **Headers:** the 2.5 mm plastic body, 0.64 mm square pins and 6.0 mm pin tail are generic 2.54 mm header values, not Espressif numbers.
- **Left out:** the BOOT/RESET buttons, the RGB LED (on GPIO38), the U2 regulator, the U3 USB-to-UART chip and the small passive parts. The drawing shows where they are but gives no heights. Leaving at least 3 mm of clearance above the board in pockets is a reasonable assumption.
- **1U-N8R8 variant:** this version has a U.FL antenna connector instead of the overhanging antenna and is not modelled.
- **PCB colour:** black is my choice; the drawing doesn't give one.
