# Molicel INR-18650-P28A

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/molicel-p28a/.

Envelope: 65.2 × 18.6 × 18.6 mm (studio frame, Y up).

The model matches every official number in record.json, so nothing needed fixing. check_scene finds no issues, and renders of both ends show the cap at +X and a plain can bottom at −X.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (cell height, terminal to base) | 65.2 mm max | x −32.6 to +32.6 = 65.2 | OK |
| Envelope Y (diameter) | 18.6 mm max | y −9.3 to +9.3 = 18.6 | OK |
| Envelope Z (diameter, on floor) | 18.6 mm max | z 0 to 18.6 = 18.6 | OK |
| Diameter | 18.6 mm max | Can 18.6; cap 7.0, inside it | OK |
| Height includes positive terminal | 65.2 mm | Can 64.7 + cap 0.5 = 65.2 | OK |
| Positive terminal toward +X | +X | Cap top at x = +32.6 | OK |
| Negative end | Flat can bottom | Flat can end at x = −32.6 | OK |
| Can shape | Steel cylinder | Cylinder, axis along X at y = 0, z = 9.3 | OK |
| Positive terminal size | Not given | Shallow placeholder cap, kept inside 65.2 | OK (conservative) |

**Placement:**
- **Positive cap:** it is centred on the cell axis. The can's end face is at x = 32.1, and the cap sits in a 0.2 mm seat, from x = 31.9 to 32.6. It stands 0.5 mm proud of the face, so it isn't buried and doesn't float.
- **Can:** it touches the floor at z = 0.
- **Overlaps:** there is nothing flush or overlapping between the two bodies.

**Not dimensioned** (kept plain, all inside the official envelope):
- **Positive cap:** Ø7 mm, standing 0.5 mm proud. Both numbers are placeholders.
- **Insulating ring** around the positive cap: not modeled.
- **Crimp groove and shoulder** at the positive end: not modeled.
- **End-edge rounding:** 0.6 mm, a placeholder.
- **Wrap:** thickness not given, so it's not modeled as a separate layer. The red colour is an assumption; no source gives it.
- **Negative end:** no features given, so it's a flat can bottom.
