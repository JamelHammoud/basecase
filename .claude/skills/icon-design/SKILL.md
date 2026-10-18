---
name: icon-design
description: How to design a custom icon for this studio (view rail, toolbar, panels, menus) so it matches the shipped set — the 24 grid, 2px round strokes, outline/filled pairs, optical sizing — and how to preview candidates side by side before shipping. Use whenever a lucide-react icon doesn't say the right thing, or the user asks for a new or better icon.
---

# Icon design

The studio's icons are `lucide-react` plus a few of its own in `src/design-system/icons.tsx` (`PartsIcon`, `LibraryIcon`, `LayersIcon`). Custom icons must be indistinguishable in style from lucide and as carefully drawn as the tab bars in X, Apple's apps or Spotify.

## 0. Do you need a custom icon?

Search lucide first (`ls node_modules/lucide-react/dist/esm/icons | grep <word>`). Draw your own only when:

- no lucide icon says the thing clearly, or the obvious one is weak (lucide `Boxes` for Parts read as clutter), or
- the icon needs an outline/filled pair (view switchers: the rail, segmented views), which lucide doesn't ship.

## 1. Pick the metaphor

1. **One object, one idea.** The best icons are a single silhouette: bookmark, house, bell, nut. Two objects side by side (screw + nut, books + cube) read as clutter or as letters at 18px.
2. **Use the canonical metaphor.** Check how well-made products draw the same idea: X/Twitter, Apple (SF Symbols), Spotify, Phosphor, Material Symbols, and the apps on mobbin.com. In CAD, a nut or screw means a standard-parts library (Onshape, SolidWorks Toolbox).
3. **Check for collisions** with icons already in the same view. A flat hexagon nut next to the Settings gear reads as a second gear, so Parts is drawn in perspective instead. Spines in a row read as a bar chart; a squat jar-like card stack reads as a jar.
4. **Make 3–6 candidates** across different metaphors, not 6 tweaks of one. Show the user the sheet and let them pick. Their eye beats your rubric: in this repo the user picked the bookmark for Library over five book and stack designs.

## 2. Grid and stroke (same as lucide)

- `viewBox="0 0 24 24"`, `stroke-width 2`, `stroke-linecap/linejoin round`, `fill none`. Rendered at **18px** in the rail (1.5px stroke). Never smaller than 16px.
- **Live area x/y 2–22.** Rounded or angled shapes may overshoot by about 0.25 to look the same size (see §4).
- **Clearance:** at least 1.5 units of empty space between parallel strokes (about 1px at 18px), or they fuse into a blob.
- **Corners:** radius 1–2.5 on rounded rects (lucide uses 2); 1–1.5 on polygon corners. Sharp polygon corners with only a round join look slightly unfinished next to lucide.
- **Perspective:** draw 3D objects in the same flattened isometric view as lucide `Layers`/`Box`: horizontal faces squashed to about 0.5, verticals straight.
- **Snap coordinates to 0.25** where you can; compute anything derived (rounded corners, ellipses, iso faces) with `scripts/geometry.mjs` and keep two decimals.

## 3. Outline and filled states

Views that toggle (the rail, any tab-like control) use a pair, like X and Apple tab bars:

- **Idle and hover: outline.** **Active: filled.**
- The filled state has the **same silhouette** (fill plus the same 2px stroke, so the size doesn't jump). Inner detail becomes **knockouts**: a `<mask>` with black strokes of width 1.5 cuts the lines and holes out of the solid shape.
- **Knockout lines must run past the silhouette** (to y = 24, or about 40% beyond the edge point), or the cut stops one stroke-width short of the edge and reads as a dangling line.
- Mask ids come from `useId()`; never hard-code an id (every scene tab mounts its own rail).
- Simple shapes (bookmark) just set `fill="currentColor"`. Layered shapes fill the front element only (Layers fills its top sheet).

## 4. Optical size and weight

Icons in one row must look equally big and equally heavy, which isn't the same as equal bounding boxes.

- Compare the candidate **at 1×** beside its real neighbours (the sheet does this). Squint: none should look smaller, lighter or bolder.
- **Rounding removes mass.** After rounding corners, grow the shape. The Parts nut went from 16.5 to 19 units tall and overshoots the sides by 0.25. The user's first reaction to the merely rounded version was "it's visually smaller".
- Narrow shapes (bookmark, 12 wide) are fine when tall and simple; wide flat shapes should span the full 20.
- Remove detail until it reads at 1×: thread lines on a screw, spine bands on books and tiny holes all vanish or turn to mush.

## 5. Translucent colour: one path per outline

Idle rail icons are drawn in `text-white/45`, a translucent `currentColor`. Every SVG element is painted separately, so **wherever two elements overlap, the overlap is brighter** (seams, bright dots at shared corners).

- Put the whole outline in **one `<path>`** with several subpaths. A single element's stroke is painted once, however it overlaps itself.
- Write circles and ellipses as path arcs (`ellipse()` in `geometry.mjs`) so they can join that path.
- Inner lines that meet a rounded outline start and end on the corner's curve (`roundedPolygon().mids`), not on the old sharp corner, or they poke past the outline.
- The filled state is only shown at full opacity (`text-white`), so fill + stroke on one element is fine there.

## 6. Preview, compare, iterate

```bash
cp .claude/skills/icon-design/scripts/example-candidates.mjs <scratchpad>/candidates.mjs
# edit: add your candidates; keep the neighbours. Fix the './geometry.mjs' import to an absolute path.
node .claude/skills/icon-design/scripts/icon-sheet.mjs <scratchpad>/candidates.mjs <scratchpad>/sheet.png
```

The sheet shows each icon big on the 24 grid (outline and filled, with the 2–22 live area dashed), then in a mock rail at 2× (idle · hover · active) and at 1×. Read the PNG yourself, then send it to the user (`SendUserFile`, `display: render`). When the user asks for a change, show a **before and after** in one sheet. `'lucide:<name>'` pulls in any installed lucide icon as a neighbour.

Judge it by asking:

- Does it read as the thing at 1×, idle (45% white), with no label?
- Is it the same size and weight as its neighbours?
- Does the filled state look like the same object, just solid?
- No blobs, no dangling cuts, no letters (books read as "lb", a screw with a nut as "To").

## 7. Ship it

- Add it to `src/design-system/icons.tsx`: a `React.FC<GlyphProps>` (`{ filled?, className? }`) inside the shared `Glyph` wrapper (24 grid, stroke attributes, `aria-hidden`, default `w-[18px] h-[18px]`). Keep path data in named constants, with a comment saying what the drawing is and any optical correction you made.
- It's exported through `src/design-system/index.ts`. Pass `filled` from the active state: `icon={<v.Icon filled={active} />}`.
- The accessible name and tooltip still come from `IconButton`'s `title` and `shortcut` (AGENTS.md §3).
- Never copy path data from another icon set. Study them, then draw your own. lucide (ISC, already a dependency) is the exception, and its paths may be reused, as `LayersIcon` does.
- Verify in the running app (`preview_start`) in each state, and run `npm run build` and `npm run lint`.
- Add the icon to the list below and to AGENTS.md §14.

## Shipped icons

| Icon | Meaning | Drawing |
|---|---|---|
| `PartsIcon` | Parts view (real components and hardware) | Isometric hex nut, rounded 1.2, 19 tall; filled: face edges and hole knocked out. `nut(NUT_PARAMS)` in `geometry.mjs` regenerates it |
| `LibraryIcon` | Library view (saved scenes and models) | Bookmark, 12 × 18, top corners r 2.5, notch 4 deep; filled: solid |
| `LayersIcon` | Layers view | lucide `layers`; filled: top sheet solid |
| `DriveIcon` | Screw drive choices (Hex, Torx, Phillips, Pozidriv, Slotted) in the hardware configurator; no filled state (the cell's thumb shows the choice) | Head circle r 9.5; recess solid inside, about 60% of the head (hex r 5.4, Torx A 12.6 / B 7.8, cross 11.8 × 2.9, slot 14 × 2.6); Pozidriv adds four 1.5-stroke diagonal ribs clear of the cross corners. First drawn at 45% of the head, which read as dots at 20px |
| lucide `Settings` | Settings (opens a sheet, so no filled state) | lucide gear |
