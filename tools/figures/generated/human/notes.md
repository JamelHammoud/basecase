# Human

Sculpted by the studio agent on 2026-10-25 from tools/figures/briefs.mjs.

Envelope: 580.642 × 1752.707 × 311.64 mm (studio frame, Y up).

I fixed all five differences, and the second comparison against both references (front, side, iso) shows each one resolved. One small leftover: each deltoid still has a small flat top cap. The replicad kernel crashed while I was doming it, and now fails even a single cylinder, so it needs an app restart before I can finish that. The scene holds the last good build. `check_scene` is clean apart from overlaps and touching surfaces between my own body sections, which the brief allows.

**The five differences and what changed:**
1. **Shoulders looked like capsules hung off a flat shelf.** The shoulder loft is now broader at the acromion and the deltoids blend into it, giving one rounded line from the neck over the shoulder into the arm. The deltoid tops are still flat, as noted above.
2. **The neck was a vertical tube.** It now leans forward, and the back of the neck rises into the trapezius, as in the side reference.
3. **The torso side was flat like a board.** It now has a chest swell at nipple height, rounding over the shoulder blades and a lumbar curve. While fixing this, the shoulder loft started overshooting into a skirt. I now generate the torso from sections interpolated every 10 mm and joined with straight segments, which can't overshoot.
4. **The legs read as tubes.** The thighs now taper strongly to a narrower knee, with an inner bulge just above it and a deeper inner calf.
5. **The wrist showed a ring.** The forearm now ends inside the hand. The palm is thicker and the thumb sits further forward and apart.

## Proportions after the fixes (fraction of H = 1753 mm)

| Landmark / span | Target | Modeled |
|---|---|---|
| Top of head | 1.000 | 1.000 |
| Chin | 0.870 | 0.869 |
| Shoulder (acromion) | 0.818 | ≈0.818 |
| Nipple | 0.720 | 0.719 (chest peak at 1260 mm) |
| Elbow | 0.630 | 0.630 |
| Navel | 0.600 | ≈0.60 (belly peak; no navel modeled) |
| Hip joint | 0.530 | 0.51–0.54 (thigh tops) |
| Wrist | 0.485 | 0.485 |
| Crotch | 0.470 | ≈0.465 |
| Fingertips | 0.377 | 0.377 |
| Knee | 0.285 | 0.285 |
| Ankle | 0.039 | 0.039–0.043 |
| Shoulder breadth (biacromial) | 0.259 | ≈0.265 |
| Across deltoids | 0.285 | 0.286 |
| Hip breadth | 0.191 / 0.20 | 0.201 × 0.139 deep |
| Chest at armpits | 0.19 × 0.145 | 0.19 × 0.148 |
| Waist | 0.18 × 0.13 | 0.179 × 0.126 |
| Head | 0.13 × 0.087 × 0.11 | 0.130 × 0.087 × 0.114 (0.124 with nose) |
| Neck width | 0.071 | 0.071 |
| Thigh at crotch | 0.11 × 0.115 | 0.104 × 0.117 |
| Knee / calf / ankle | 0.06 / 0.07 × 0.075 / 0.04 | 0.058 / 0.071 × 0.074 / 0.040 |
| Upper arm / forearm | 0.06 × 0.065 / 0.055 | 0.059 × 0.066 / 0.055 |
| Wrist | 0.035 × 0.025 | 0.035 × 0.025 (wider front-to-back, since palms face the thighs) |
| Hand | 0.05 × 0.108 | 0.050 × 0.109 |
| Foot length | 0.152 | 0.153 |

## What I couldn't match

- **Thigh breadth versus a visible crotch:** two thighs at 0.11 each don't fit inside a 0.20 hip breadth, so I kept them at 0.104 to let them separate just below the crotch.
- **Chest depth:** the brief gives both 0.13 and 0.145. I followed ANSUR (0.145); with the new chest swell it is now 0.148.
- **Side reference:** there is still no clean single-subject side photo. The side checks are by eye against the middle figure of [Man Nude Full Body.jpg](https://commons.wikimedia.org/wiki/File:Man_Nude_Full_Body.jpg).
- **Front reference:** [Anterior view of human male, retouched](https://commons.wikimedia.org/wiki/File:Anterior_view_of_human_male,_retouched.jpg) has the arms out with palms forward, so its automatic band measurement doesn't line up with this pose.
- **Simplifications:**
  - No eye sockets, fingers, toes or navel.
  - The ears are simple flat ovals.
  - A faint seam crosses the chest at about 1335 mm, where the two torso lofts meet.
  - The torso is built from 10 mm bands, which may show as faint horizontal facets up close.
