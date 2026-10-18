# Raspberry Pi Camera Module 2

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/raspberry-pi-camera-2/.

Envelope: 25 × 9 × 23.862 mm (studio frame, Y up).

Every dimension and position in record.json matches the model, so I made no changes. check_scene and the front and side views show no interference and no floating parts. The only flag is the FPC connector sitting 2.5 mm below the floor. That's deliberate: I put it on the back of the board, under the PCB, so the PCB's bottom face can stay at z = 0 as you asked.

Measurements come from get_scene bounds and part positions. The hole positions come from the PCB code, which puts their centres at y = −D/2 + 2 and −D/2 + 14.5, with D = 23.862. The board is centred at the origin with the connector edge at y = +11.931.

| Feature | Official (record.json / drawing) | Measured on model | Result |
|---|---|---|---|
| Envelope X (connector edge) | 25 | 25.000 (−12.5…12.5) | OK |
| Envelope Y | 23.862 | 23.862 (−11.931…11.931) | OK |
| Envelope Z | ≈9 | 9.0 (−2.5…6.5) | OK |
| PCB corners | 4× R2.0 | r = 2.0 | OK |
| Hole diameter | 4× Ø2.2 | Ø2.2, through all 1 mm of PCB | OK |
| Hole pitch X | 21 (2 mm from each 23.862 edge) | x = ±10.5 → 21.0; 12.5 − 10.5 = 2.0 | OK |
| Hole row 1 | 2 from the edge opposite the connector | y = −9.931 → 2.000 | OK |
| Hole row 2 | 14.5 from the opposite edge (9.362 from the connector edge) | y = +2.569 → 14.500 / 9.362 | OK |
| Hole pitch Y | 12.5 | 2.569 − (−9.931) = 12.500 | OK |
| Lens centre X | 12.5 from either side (centred) | x = 0 → 12.500 | OK |
| Lens centre Y | 9.462 from the connector edge | 11.931 − 2.469 = 9.462 | OK |
| Lens housing size | 8.5 × 8.5 | 8.5 × 8.5 (x −4.25…4.25, y −1.781…6.719) | OK |
| Lens seating | stands on PCB top face | base z = 1.0 = PCB top | OK |
| FPC connector length | 20.8 | 20.8 (x −10.4…10.4, centred) | OK |
| FPC connector depth | 5.5 | 5.5 (y 6.431…11.931) | OK |
| FPC connector flush with edge | outer face at the board edge | y max 11.931 = PCB edge | OK |
| FPC connector seating | on the PCB face | top z = 0 = PCB bottom (back side) | OK |

All three parts touch their mating faces: the lens housing sits on the PCB top and the connector hangs from the PCB bottom.

**Not dimensioned.** These are my estimates or were left out:
- **PCB thickness:** 1.0 mm (estimated).
- **Lens housing height:** 5.5 mm, chosen so the total fills the ~9 mm documented depth.
- **Connector height:** 2.5 mm (estimated).
- **Which face the connector is on:** I put it on the back. The drawing shows the connector's 5.5 mm depth overlapping the lens square by 0.288 mm in plan, so they can't both be on the top face. That deduction is mine and isn't marked on the drawing.
- **Lens barrel, aperture and focus ring:** no numbers given, so the housing is a plain square block.
- **Sensor flex and its small connector:** the drawing gives only outline positions (13.8 and 4.7 mm), not sizes or heights, so I didn't model it.
- **Passive components, ICs, and the connector's latch and contacts:** not modelled.
