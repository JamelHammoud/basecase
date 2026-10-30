# Print plan: from design to a print on the bed

Stage 5 of the robotics loop ([Robotics loop.md](Robotics%20loop.md)) says Build is partial: “Missing: slicer handoff”. This plan closes that gap. The goal: a robot designed in Basecase goes onto the user's printer without exporting files, arranging plates by hand or re-entering settings, and it works for any common FDM printer, not just the Bambu Lab P1S.

## Status (2026-10-25)

All seven milestones are built. AGENTS.md §8f describes how the code works now; this file keeps the plan, what changed from it, and what still needs a real printer to confirm.

| # | Milestone | State | Verified by |
|---|---|---|---|
| P1 | Printers | Done: 92-printer catalog generated from Bambu Studio 2.08.04, My printers, Settings → Printers, Printer and Quality in the Build tab, the agent's text names the scene's printer | `printReport.test.ts` (P1S keep-out, Prusa MINI diagonal, custom bed) |
| P2 | Plates as data | Done: poses with flat faces, MaxRects packing, per-part overrides, copies, plate hashes | `plan.test.ts` (transforms fill their rectangle on the bed), `printReport.test.ts` |
| P3 | Print mode | Done: plate view, drag, Lay on Face, Turn 90°, plate switching, Auto Arrange, Print panel | `e2e/print.e2e.test.ts` (opens, shows the plate, closes, no console errors) |
| P4 | 3MF handoff | Done: Export ▸ 3MF Plates (one file per material), Open in Bambu Studio / OrcaSlicer as a full project with printer, process and filament set | `slice.test.mjs` |
| P5 | Slice in Basecase | Done with Bambu Studio and OrcaSlicer's CLI (same family); PrusaSlicer is detected but not used for slicing | `slice.test.mjs` slices for real on this Mac: two plates, PLA and TPU, Textured PEI plate, 25% infill, cached rerun |
| P6 | Send to printer | Done: Bambu Studio (default), Bambu Connect, Bambu LAN, Moonraker, PrusaLink, OctoPrint; discovery; Start Print sheet with AMS slot | Connector tests against local fake servers (MQTT, FTPS over TLS, HTTP). **Not yet run against a real printer** |
| P7 | Prints tracker | Done: print records, live state, Mark Printed / Failed, Skip printed parts | Unit-level only |

## Principles

- **The scene stays the truth.** Plates, orientations and slicer projects are generated from the scene, never stored as the design. Changing a part marks its plate as changed, like an out-of-date build guide.
- **One printer model, many connections.** Bed geometry, keep-outs and limits come from the printer profile; how a file reaches the printer is a separate connector. The P1S is one entry in each, not a special case.
- **Use the slicer the user already trusts.** Basecase arranges and orients; slicing is done by Bambu Studio, OrcaSlicer or PrusaSlicer through their own CLIs, with their own system profiles. We never write G-code or ship our own slicer engine. These slicers are AGPL, so we call an installed copy (or one downloaded on request from the official release), never bundle one.
- **Starting a print is always the user's click.** A print heats a nozzle and moves a machine. The agent can lay out and slice plates; only the user starts a print, after seeing the plate and the filament it needs.
- **Performance rules hold (§0f).** 3MF writing runs in a worker; slicing runs in a child process; plate previews reuse the shared geometry cache. Nothing blocks a click.

## Milestones

Each milestone ships on its own and is useful without the next.

| # | Milestone | What the user gets | Size |
|---|---|---|---|
| P1 | Printers, not the P1S | Pick a printer; every check, estimate and agent instruction follows it | S–M |
| P2 | Plates as data | Real per-part orientation and plate positions, saved overrides | M |
| P3 | Print layout mode | See and adjust the plates on the canvas | M–L |
| P4 | 3MF handoff | Export or open the plates in Bambu Studio / Orca / PrusaSlicer, ready to slice | M |
| P5 | Slice in Basecase | Real grams, time and warnings per plate, no estimates | M |
| P6 | Send to printer | Start a plate from Basecase; see progress | L |
| P7 | Prints tracker | Which plates are printed, which changed since, reprint only those | M |

For the P1S, **P1 + P2 + P4** already turn today's workflow (export STL, split, orient, arrange in Bambu Studio) into one click: Open in Bambu Studio, then Print there.

---

### P1. Printers, not the P1S

**Data**

- `src/data/printers.ts`: a `PrinterModel` catalog: `id`, `maker`, `name`, `bed` (polygon, mm), `height`, `keepOut` (polygons), `nozzles`, `heatedChamber`, `materials` it can print (no ABS/ASA on an open-frame printer without a warning), `slicer` (`bambu` | `orca` | `prusa`) with the system profile names for machine / process / filament, and `connection` kinds it supports (P6).
- **Generated from slicer profiles, never typed by hand.** Bambu Studio and OrcaSlicer ship every maker's machine profiles (`Resources/profiles/<Maker>/machine/*.json`: `printable_area`, `printable_height`, `bed_exclude_area`, inherited through `inherits`). The P1S profile resolves to 256 × 256 × 250 with the 18 × 28 keep-out we hard-code today. `tools/printers/import.mjs` resolves the inheritance chain and writes the catalog with each profile's source and slicer version, like `tools/parts/`. First set: Bambu P1S, P1P, X1C, A1, A1 mini, H2D; Prusa MK4S, Core One, MINI+; Creality K1C, K2 Plus, Ender-3 V3; Elegoo Centauri Carbon; Voron 2.4 (300 / 350); Qidi Plus4. Plus **Custom**: bed W × D × H and an optional keep-out.
- App-wide **My printers** in `library/printers.json` (`{ id, model, nickname, nozzle, connection?, loaded? }`): printers belong to the user, not the scene. One is the default.
- `ProjectSettings.printer` becomes a string (a My printers id, or a catalog id for “designing for a printer I don't own”). Old scenes with `'bambu-p1s'` map to the P1S model; `DEFAULT_PROJECT` takes the user's default printer.

**Code**

- `printability.ts`: `P1S` becomes `printerLimits(model)`; `bedFitYaw`, `checkPrintability`, `packPlates` take the printer (keep-outs as polygons, not one corner rectangle). Overhang 45°, support 30° and min wall 2 × line width stay as defaults, derived from the nozzle.
- Shape cache keys in `printReport.ts` include the printer id, so switching printers re-checks parts.
- Text everywhere names the printer: `issuesFor`'s split note, `printReportText`, the `PrintedSection` footnote (“Estimate for a Prusa Core One: …”), `check_printability`'s description (built per call from the scene's printer), and the prompt's “Print on the P1S” step (`cad-agent-prompt.mjs`), which becomes “Print on the scene's printer (its bed and keep-outs are in check_printability)”. The bench `build-humanoid` brief keeps naming the P1S explicitly.

**UI**

- Build → Printed parts gets a **Printer** row above Material: a `Select` of My printers, then Add Printer.
- Settings gets a **Printers** pane (§6a): one row per printer (name, model, nozzle, connection state from P6), Add Printer (model picker with search, grouped by maker, plus Custom), Make Default, Remove.
- Material lists only what the printer can print well; ASA/ABS on an open printer shows an amber note.

**Done when** every P1S number in `src/` and `electron/` comes from the catalog, the catalog is generated from slicer profiles, and `printability.test.ts` covers a P1S, a Prusa Core One (no keep-out, 250 × 220) and a Custom bed.

---

### P2. Plates as data

Today orientation and packing are computed, reported as text and thrown away. Make them the plan the rest of the pipeline uses.

- `PrintCheck` gains the transform that lays the part flat: `layFlat` (a rotation, part frame → print frame) and its footprint polygon after `yaw` (convex hull, not the bounding box, so L-brackets nest).
- `packPlates` returns positions: `{ plate, x, y, yaw }` per part, keeping keep-outs and a gap. Shelf packing stays as the fast first pass; a second pass tries convex-hull footprints in a worker for denser plates. Plates are grouped by material, then by printer settings that can't mix (layer height, nozzle).
- **Overrides** live in the scene: `ScenePart.print?: { face?: BuildAxis | number[], yaw?: number, plate?: number, x?: number, y?: number, copies?: number, skip?: boolean }`. `face` can be any face normal the user clicked (P3), not just the 6 axes. Overridden parts are packed first, at their fixed spots; everything else packs around them. Undoable like any part edit.
- **Copies**: identical printed parts (mirrored legs, the 4 identical brackets) share a shape key already; plates show them as one object × N so the slicer arranges copies, and `copies` lets the user print spares.
- `buildPrintPlan(parts, project, printer)` → `PrintPlan` (plates, each with parts, transforms, material, estimated grams and time): pure data, no React, no three.js scene, tested in `printPlan.test.ts` against a fixture robot built in code.

**Done when** the build-humanoid fixture produces a plan where every part sits inside its bed, outside keep-outs and other parts' footprints, and the plan is stable across runs (same input → same layout, so P7 can tell what changed).

---

### P3. Print layout mode

A mode, like Measure or Sketch: the canvas shows plates instead of the assembled robot; the inspector shows the Print panel.

- **Opening:** Build → Printed parts → **Lay Out Plates**; File → Print (⌘P); ⌘K “Lay Out Plates”. Done (Esc) returns to the assembly.
- **Canvas:** one plate at a time, drawn to scale: the bed outline, its keep-outs shaded, the printable height as a faint box. Parts appear in print orientation (`PlateLayer` in `three/viewport/`, reusing `buildPartGroup` with `shareGeometry`, so no geometry is rebuilt; the assembly's `PartLayer` is hidden, not torn down). A strip of plate thumbnails sits above the toolbar, like the marks pill: “Plate 1 PLA”, “Plate 2 PLA”, “Plate 3 TPU”; ←/→ switch.
- **Adjusting:**
  - Drag a part to move it on the plate; drag it onto another plate's thumbnail to move it there.
  - **Lay on Face** (F while in the mode, also in the right-click menu): click a face and the part turns to put it on the bed.
  - Rotate snaps yaw in 15° steps (⇧ free).
  - Auto Arrange re-packs a plate, keeping overrides it can.
  - A part that doesn't fit shows red with its fix (“Split it into 2 pieces along its longest side”) and isn't placed.
- **Print panel** (replaces the inspector): printer and nozzle, material per plate (or AMS slot, P6), layer height and infill presets from the printer's slicer profiles (Standard 0.20 mm, Strength, Fine), then per plate its parts, estimated grams and time; footer actions: Open in ⟨slicer⟩ (P4), Slice (P5), Print (P6).
- Selecting a part in the mode and pressing Done selects it in the assembly too.

**Done when** e2e opens the mode on a fixture scene, switches plates, moves a part and lays one on a face with undo/redo, with no console errors and no part rebuilds in the assembly (§0f).

---

### P4. 3MF handoff

The universal step: every desktop slicer opens 3MF.

- `src/print/threeMf.ts` writes a 3MF in a worker (three.js's bundled `fflate`): one object per printed shape with its name, each placed by the plan's transforms, units mm. Two flavours:
  - **Project 3MF** for Bambu Studio and OrcaSlicer: adds `Metadata/model_settings.config` (plates, object names, per-object filament) and `Metadata/project_settings.config` naming the printer, process and filament presets, so the file opens with plates, printer and filaments already set. Format checked against files those slicers write, not guessed.
  - **Plain 3MF** (core spec) for PrusaSlicer, Cura and others: one file per plate, already arranged.
- **Export** menu gains **3MF Project** (beside STL Mesh). Build → Printed parts and the Print panel get **Open in Bambu Studio** (or Orca / PrusaSlicer, whichever the printer's `slicer` names and is installed): write to `library/prints/<scene>/<timestamp>.3mf`, then open it with the app (`open -a`; Bambu Studio also registers `bambustudioopen://`).
- **Slicer detection** (`electron/printers/slicers.mjs`): find Bambu Studio, OrcaSlicer, PrusaSlicer in `/Applications` and `~/Applications`, read their versions. Not installed: “Get Bambu Studio” opens the maker's download page.
- STL export stays for the whole assembly; a new **STL per part** zip option names files after parts, in print orientation.
- Toast: “Opened Robot Arm in Bambu Studio” / “Exported Robot Arm.3mf”.

**Done when** the fixture's project 3MF opens in Bambu Studio 2.07 and OrcaSlicer (current) with the right plates, printer, filament per plate and part names, and the plain 3MF opens in PrusaSlicer arranged; a test parses the written 3MF back and checks every transform against the plan.

---

### P5. Slice in Basecase

Replace estimates with the slicer's own numbers, without leaving the app.

- `electron/printers/slice.mjs` runs the detected slicer's CLI headless on the project 3MF (`--slice 0 --export-3mf <out>.gcode.3mf`, with the machine, process and filament profiles named by the printer model) as a child process, one at a time, cancellable, like the trainer.
- **Results** come from the sliced 3MF, not stdout: per plate the print time, filament length and volume, support, and the slicer's warnings (`Metadata/slice_info.config` in Bambu and Orca files), plus the plate thumbnails the slicer renders. Grams are volume × the material density we already have (the CLI can report 0 g).
- **Cached** by a hash of the plate (part shape keys, transforms, settings): an unchanged plate is never re-sliced. Output lives in `library/prints/<scene>/`.
- **UI:** Slice in the Print panel and Build → Printed parts. While it runs, each plate shows “Slicing plate 2 of 4”. Afterward, Printed parts' totals drop the estimate wording (“1,240 g”, “14 h 20 m”, “4 plates”) and the footnote names the slicer and profile (“Sliced in Bambu Studio 2.07: 0.20 mm Standard, 15% infill”). Plates out of date after an edit turn amber with Slice Again. Slicer warnings show under their plate, verb first where we can map them (“Add a brim to the left foot: small contact area”).
- **Agent:** a `slice_plates` tool (same cache) and `check_printability` reports sliced numbers when they're current. The budget's filament cost uses sliced grams.
- **Version pinning:** `tools/print/smoke.mjs` slices the fixture with every supported slicer and checks plates, time and volume land within expected ranges; run it when a slicer updates, like `tools/sim/smoke.mjs` for MuJoCo. Supported versions are listed in `printers.ts`; others run with a note.
- **Later:** a layer preview (parse the G-code's moves into line segments in a worker, draw with a layer slider in Print mode). The slicer already does this well, so it waits until there's a reason.

**Done when** slicing the fixture in Basecase matches slicing the same 3MF in the Bambu Studio app (time within 1%, volume exact), runs off the main thread, and a second Slice with no edits returns instantly.

---

### P6. Send to printer

Connectors per ecosystem in `electron/printers/connect/`, one interface: `discover()`, `status()`, `upload(file)`, `start(plate, options)`, `cancel()`, `pause()`.

| Ecosystem | Printers | How | Status |
|---|---|---|---|
| **Bambu Connect** | All Bambu printers, cloud or LAN | Hand the sliced `.gcode.3mf` to Bambu Connect (`bambu-connect://import-file?path=…&name=…&version=1.0.0`); the user picks the printer and starts there | Official route for third-party apps since Bambu's 2025 authorization firmware. No status back |
| **Bambu LAN (Developer Mode)** | P1S, P1P, X1C, A1… with Developer Mode on | Upload over FTPS (port 990), start with an MQTT `project_file` command (port 8883, TLS, user `bblp`, the printer's access code); status, AMS slots, errors over MQTT; P1 camera on port 6000 | Full control, but the printer must be LAN-only and Bambu doesn't support the protocol |
| **Moonraker** | Klipper printers: Voron, Creality K1/K2 (rooted), Qidi, Sovol, Elegoo with Klipper | `POST /server/files/upload` with `print=true`; status over its websocket | Open, documented API |
| **PrusaLink** | MK4S, Core One, MINI+, XL | `PUT /api/v1/files/usb/<file>` with `Print-After-Upload`; `GET /api/v1/status` | Documented API, API key from the printer |
| **OctoPrint** | Anything running OctoPrint | `POST /api/files/local` with `print=true`; `GET /api/job` | Documented API, API key |

- **Add Printer** (Settings → Printers): Find on Network (Bambu printers answer SSDP on the LAN; Moonraker, OctoPrint and PrusaLink usually advertise over mDNS), or enter an address. Access codes and API keys are stored like agent keys (`safeStorage`, `library/agent-config/printer-keys.json`), never in the scene or in logs.
- **For your P1S:** start with Bambu Connect (works with the cloud account and today's firmware, one extra click in Bambu Connect). Offer LAN Developer Mode as an advanced connection for people who want status and one-click starts in Basecase, with Bambu's own warning repeated plainly.
- **Starting a print** (Print in the Print panel): a sheet shows the plate thumbnail, printer, material and grams, the AMS slot or loaded filament it maps to (where the printer reports one; a mismatch blocks with the fix: “Load PETG in slot 2 or change the plate to PLA”), and “Clear the bed” as a reminder, then **Start Print**. Never from the agent, never in the background.
- **Status:** a printing plate shows its progress, layer and time left in its plate tile and the Build tab; errors (HMS codes on Bambu) are translated to a sentence with the fix where known. A toast says when a plate finishes: “Plate 2 finished on P1S”.

**Done when** a plate goes from Basecase to the P1S through Bambu Connect, and through LAN mode on a Developer Mode printer with live progress; Moonraker, PrusaLink and OctoPrint connectors pass tests against recorded responses (and a real printer where one is available).

---

### P7. Prints tracker

The build is many plates over days. Track them so the user knows what's left, and so design changes only reprint what changed.

- `project.prints`: per plate, the plate hash, printer, when it was sent and its outcome (Printing, Printed, Failed, Cancelled), recorded from P6 status or marked by hand (right-click a plate: Mark Printed).
- Build → **Prints**: plates with their state. A printed part whose shape changed afterwards shows amber: “Reprint 2 changed parts”, which builds a plate of just those parts.
- The build guide (§8b) uses it: a step's printed parts can be ticked off as printed.
- Failed prints feed the fix loop: the agent sees which parts failed and the user's note (“warped at the corners”) in `get_bom` / `check_printability`.

**Done when** editing one bracket after printing marks only that bracket's plate as changed, and Reprint makes a plate with it alone.

---

## Copy

All new strings follow §3. Proposed:

| Where | Text |
|---|---|
| Build → Printed parts buttons | Lay Out Plates, Open in Bambu Studio, Slice |
| Print panel footer | Open in ⟨slicer⟩, Slice, Print |
| Start sheet | title “Print Plate 2 on P1S?”, Cancel, Start Print |
| Toasts | Opened Robot Arm in Bambu Studio, Sliced 4 plates, Sent Plate 2 to P1S, Plate 2 finished on P1S |
| Out of date | Slice Again (amber plate), Reprint 2 changed parts |
| Settings | Printers pane, Add Printer, Find on Network, Make Default |
| No slicer | Get Bambu Studio |
| Footnote, estimate | Estimate for a Prusa Core One: 2 walls, 15% infill, best flat orientation. Slice to confirm. |
| Footnote, sliced | Sliced in Bambu Studio 2.07: 0.20 mm Standard, 15% infill |

## Order and dependencies

```
P1 printers ─→ P2 plates ─┬─→ P3 layout mode
                          └─→ P4 3MF ─→ P5 slice ─→ P6 send ─→ P7 tracker
```

P3 and P4 can run in parallel once P2 lands: P4 needs only the plan, not the mode. P6's Bambu Connect route needs a sliced file (P5); the Moonraker, PrusaLink and OctoPrint routes can upload G-code from the same CLI with the printer's profile.

## What building it changed

- **Profiles must be flattened.** Bambu Studio's CLI loads a machine file without following its `inherits` chain, so `printable_area` falls back to 200 × 200 × 100 mm and anything taller than 100 mm is rejected. Basecase writes fully resolved machine, process and filament files per job.
- **Plates come from positions, not metadata.** A plain 3MF with `--arrange 0` keeps every object where it is, and the CLI puts each one on the plate whose grid cell holds it (stride = plate size × 1.2, columns ⌈√n⌉ as Bambu rounds it). Hand-written `model_settings.config` plate lists are ignored for non-Bambu files, and a file that claims to be a Bambu project without its full settings crashes the CLI.
- **One material per job.** `--load-filament-ids` only works with STL input (which loses the plate grid), and editing a Bambu project's per-object filament crashes the CLI. So each material's plates are their own 3MF, slice and project file. Opening in Bambu Studio opens one material's project at a time.
- **Unsliced projects work.** Running the CLI without `--slice` writes a complete Bambu project with the printer, process and filament embedded; that's what Open in Bambu Studio opens.
- **The plate type matters.** Without `curr_bed_type`, the CLI uses the Cool Plate and its bed temperatures. Basecase sets each printer's default (Textured PEI for the P1S).
- **Packing uses rectangles.** The convex-hull nesting pass in P2 wasn't built: rectangles of each part's footprint, MaxRects-packed around the keep-outs, were enough for the fixture robots.
- **Tracking is by part, not plate.** Re-packing after an edit can reshuffle every plate, so a part counts as printed while its shape is unchanged, and printed parts are left off new plates by default.
- **Sending defaults to Bambu Studio.** For a Bambu printer that's already signed in to Bambu Studio (the common case), opening the sliced plates there and pressing Print is the officially supported route; Bambu Connect and Developer Mode stay as options.

## Still to confirm on real hardware

- A plate through Bambu Studio's Print button on the P1S (the default route).
- Bambu LAN: FTPS session reuse on real firmware, `project_file` starting the print, the AMS mapping, P1-series status deltas.
- Moonraker, PrusaLink and OctoPrint against real servers; SSDP and mDNS discovery on a real network.
- OrcaSlicer: built against the same CLI and profile layout, but not installed on this Mac, so untested.

## Risks and open questions

- **Bambu's auth rules move.** Bambu Connect is still labelled beta and Developer Mode is unsupported. Keep both behind the connector interface and keep P4 (open in Bambu Studio) as the route that always works.
- **Slicer CLIs drift between versions** (flag names, profile compatibility, the 0 g weight). Pin tested versions in `printers.ts` and run `tools/print/smoke.mjs` on updates.
- **Project 3MF metadata is undocumented.** Generate it from files Bambu Studio and Orca write, with a round-trip test, and fall back to plain 3MF if a slicer rejects it.
- **Licensing:** don't bundle Bambu Studio, Orca or PrusaSlicer (AGPL). Detect installed copies; at most download the official release into `library/` on the user's request.
- **Part splitting** for parts that don't fit is still the agent's job (it adds dowels or screws across the split); a one-click Split for the user is a later addition to P3.
- **Open question:** should the per-scene printer default to the user's printer even when opening someone else's scene? Proposed: yes, with the scene's saved printer shown when it differs (“Designed for an X1C”).
