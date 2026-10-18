# Raspberry Pi AI Camera

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/raspberry-pi-ai-camera/.

Envelope: 25 × 11.9 × 23.862 mm (studio frame, Y up).

The model matches the official numbers, so I made no changes. All 18 checks below come out OK. Two drawing labels (1.12 and 3.875) aren't checked because the brief doesn't say clearly what they measure; they're listed under "Not dimensioned". `check_scene` reports no interferences and no floating parts. Its one issue is that the rear FPC connector sits 2.55 mm below the floor (z −2.55 to 0). That comes from your pose rule: the PCB bottom is at z = 0 and the connector is on the back of the board. To put the whole part on the floor, raise every part by 2.55 mm.

The PCB is centred at x = y = 0. The connector edge is at y = −11.931 and the opposite (top) edge at y = +11.931. Values are measured from the scene bounds; hole centres come from the PCB code.

| # | Feature (record.json / brief p.4) | Official | Measured on the model | Result |
|---|---|---|---|---|
| 1 | Envelope X (PCB width) | 25 | 25.00 (−12.5 → 12.5) | OK |
| 2 | Envelope Y (PCB height) | 23.862 | 23.862 (±11.931) | OK |
| 3 | Envelope Z (overall depth) | 11.9 | 11.90 (−2.55 → 9.35) | OK |
| 4 | PCB thickness | 1 | 1.00 (z 0 → 1) | OK |
| 5 | Mounting hole diameter | Ø2.2 ×4 | Ø2.2 ×4, through the PCB | OK |
| 6 | Holes from the left/right edges, pitch along X | 2.0 / 21 | x = ±10.5 → 2.0 from each edge, 21 apart | OK |
| 7 | Holes from the top edge (opposite the connector) | 2.0 and 14.5 | y = 9.931 → 2.0; y = −2.569 → 14.5 | OK |
| 8 | Hole pitch along Y | 12.5 | 9.931 − (−2.569) = 12.5 | OK |
| 9 | Lens centre, X | on the centreline (12.5 from the edge) | x = 0 | OK |
| 10 | Lens centre from the top edge / connector edge | 14.4 / 9.462 | y = −2.469 → 14.4 / 9.462 | OK |
| 11 | Lens front diameter | Ø5.75 | Ø5.75 | OK |
| 12 | Lens front above the holder face ("2.75") | 2.75 | 9.35 − 6.60 = 2.75; the barrel starts on the holder top | OK |
| 13 | Lens front above the package face ("6.98") | 6.98 | 9.35 − 2.37 = 6.98 | OK |
| 14 | Optics housing width | 12.8 | 12.8 (package, ±6.4) | OK |
| 15 | "19.5" (package top edge to the connector edge) | 19.5 | 7.569 − (−11.931) = 19.5 | OK |
| 16 | "12" × "12.5" lens holder, centred on the lens | 12 × 12.5 | 12 × 12.5 (y −8.72 → 3.78, centre −2.469) | OK |
| 17 | Rear connector width, centred ("19.61") | 19.61 | 19.61 (−9.805 → 9.805) | OK |
| 18 | Rear connector length from the connector edge / thickness | 5.71 / 2.55 | 5.71 (y −11.931 → −6.221) / 2.55 (z 0 → −2.55) | OK |

**How the parts sit:**
- The package rests on the PCB top (z 1.0), the holder on the package top (2.37), and the barrel on the holder top (6.60). The connector sits against the PCB underside (z 0).
- Each part on the camera side stays within the footprint of the one below it. No visible face is buried inside another part.
- All four holes are clear of the package (it ends at |x| 6.4; the holes start at |x| 9.4) and of the connector.

**Not dimensioned:**
- **"1.12" label:** it's on the side view, but it's unclear whether it's the package layer or the PCB plus flex. I modelled the package as one solid block 1.37 thick (z 1.0 → 2.37). That keeps the 6.98 and 11.9 numbers exact; the undimensioned gap from the board-to-board connector is folded into the block.
- **"3.875" step in the lens stack:** it has no width, so I didn't model it. The holder is a single 12 × 12.5 block.
- **Ø4.75 ring around the hole pads:** probably a pad or keep-out circle, so I didn't model it. Keep it clear when you design mounts.
- **PCB corner radius:** not given, so the corners are square.
- **Package's connector-side end:** kept flush with the PCB edge, as the 19.5 callout shows; the photo suggests it stops slightly short.
- **Lens detail:** the focus ring, thread and glass recess aren't modelled. The barrel is a plain Ø5.75 cylinder.
- **FPC connector:** the latch, slot and pins aren't modelled; it's a plain block.
- **Small parts and silkscreen:** passives, crystals, the RP2040, the logo and the QR code are left out.
- **Cable:** the FPC ribbon is excluded, as you asked.
- **FOV cones (66.3° × 52.3°):** these describe the optics, not geometry, so they're not modelled.

Source: [Raspberry Pi AI Camera product brief (RP-008147-DS-1)](https://pip-assets.raspberrypi.com/categories/1044-raspberry-pi-ai-camera/documents/RP-008147-DS-1-ai-camera-product-brief.pdf), via record.json and the attached page images.
