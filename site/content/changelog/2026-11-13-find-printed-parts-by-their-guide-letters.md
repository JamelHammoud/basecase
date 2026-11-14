---
title: Find each printed part by its guide letter
date: 2026-11-13
image: /changelog/find-printed-parts-by-their-guide-letters/cover.png
---

You can now print each part with its build guide letter cut into a face nobody sees once the robot is built. It's on by default, as Label parts in Print mode.

Many printed parts of a legged robot come in left and right mirror pairs. The build guide gives each one a letter, but the letters lived only on paper. So a first build meant holding two brackets up to the screen to tell them apart.

Basecase picks the largest flat face that touches no other part and isn't the face the part prints on. That face must also be hidden: no ray from 96 directions around the built robot reaches it. The letter goes as near its middle as it fits, 0.4 mm deep and 4 to 10 mm tall. The letters come from the guide's own plan, so the PDF, Build Along and the parts agree.

Only the plate files change. The scene, Checks, the bill of materials and the record of printed parts stay as they were.

A part with no hidden, free face big enough prints without its letter. Its row in Parts says so.

Steps are in [Label printed parts with their guide letters](/help/label-printed-parts).
