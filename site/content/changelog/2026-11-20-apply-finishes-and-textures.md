---
title: Apply finishes and textures
date: 2026-11-20
image: /changelog/apply-finishes-and-textures/cover.png
---

You can finish editable robot parts with matte polymer, brushed metal, rubber, paint and transparent covers. Local image textures stay with the scene when you save or share it.

Select parts and open Appearance in the Inspector. Each finish has separate roughness, metalness and opacity controls, plus base color, normal and combined roughness/metalness textures. With multiple parts selected, you apply the finish in one undoable edit.

You can give a gripper shell painted surfaces and its pads a rubber finish while keeping its printed TPU manufacturing declaration. These visual edits leave mass, the BOM and actuator specifications unchanged.

For generated parts, you use an explicit projection with millimeter scale and rotation. For meshes with authored UVs, you can keep those coordinates.

You can use local PNG, JPEG or WebP files, up to 8 MB and four million pixels each. Across a scene, the limits are 32 MB and eight million pixels. If a texture is missing, you keep the geometry and scalar finish and can replace the texture in Appearance.

Read [Apply finishes and textures](/help/apply-finishes-and-textures) for the steps.
