---
name: add-part
description: How to add a real product (servo, motor, board, sensor, camera, LiDAR, gripper, hand, battery, regulator, wheel, actuator, display) to Basecase's Parts catalog from a link or a name — identify the exact product, find the maker's CAD or drawing, convert or model the mesh, measure it, write the catalog entry, mounting ports and list price, and verify. Use whenever someone asks to add, include or support a part, component, board or product, or pastes an Amazon, store or maker link and asks for it in the app.
---

# Add a part

Basecase's Parts library holds **real products with exact geometry, never estimates** (AGENTS.md §8a, §13-2). A part someone adds becomes the thing every robot is designed around: brackets are bolted to its holes and pockets are cut to its envelope. So a part is only done when its mesh, holes and numbers all trace back to the maker.

The steps below are the whole path. Follow them in order; each says what "done" looks like. Worked example: `radxa-zero-3w` (an Amazon link → the maker's STEP → catalog entry, ports and price).

## 0. Is it a catalog component?

| What it is | Where it goes |
|---|---|
| A product you buy whole: servo, motor, board, sensor, camera, gripper, battery, regulator, wheel… | **This skill** → `src/data/components.ts` |
| A standard fastener or stock part sized by a standard (screws, nuts, bearings, extrusion, shafts, pulleys) | A hardware family, not a component: `src/data/hardware.ts`, `motionHardware.ts`, `frameHardware.ts` (AGENTS.md §5, “Motion and frame hardware”) |
| A hand whose maker publishes a URDF / MJCF with finger joints | A component first (this skill), then `src/data/articulatedParts.ts` (§8c “Posable hands”) |
| A whole robot | `ROBOT_PRESETS` in `utils/robotImport.ts` (§8c), not Parts |
| Generic bought goods with no exact shape (wire, chargers, filament) | `src/data/supplies.ts` |

## 1. Identify the exact product

- From an Amazon link, read the title with WebFetch (`https://www.amazon.com/dp/<ASIN>`; drop tracking parameters). Search engines don't index ASINs. Note the **variant** in the title (RAM size, voltage, gear ratio, “with header”): it decides the MPN, the mesh and the price.
- Find the maker's own pages: product page, datasheet or product brief, mechanical drawing, and the **CAD / downloads page** (often “Resources”, “Downloads”, “Hardware”, or a GitHub repo). Write down the exact MPN / SKU for the variant.
- Check it isn't already there: `grep -in "<model words>" src/data/components.ts` (names, `mpn`, `keywords`). A new variant of an existing part goes in that part's `variants` (actuators) or its `mpn` text, not a new entry.
- Pick the **id**: `maker-model` in kebab case, lowercase, no variant unless the variants differ in shape (`feetech-sts3215`, `raspberry-pi-zero-2w`, `radxa-zero-3w`).

Done when you can name the maker, the MPN for this variant, and the official sources you'll take numbers from.

## 2. Get the mesh (pick the first path that works)

Every number and the mesh come from the maker. Seller listings, community models (GrabCAD, Thingiverse, other robots' repos) and your own estimates don't count, except as §2C allows.

### 2A. Maker CAD (STEP / IGES) — preferred

1. Download into the gitignored CAD folder, never into `src/` or the repo root:
   ```bash
   mkdir -p tools/parts/cad/<id> && cd tools/parts/cad/<id> && curl -sSLO <url> && unzip -o -q <file>.zip
   ```
   Also grab the drawing (DXF / PDF) and datasheet if they're there: you'll check the mesh against them.
2. Add an entry to `tools/parts/sources.json` **by editing the text** (Edit tool), appended before the final `}`. Never `JSON.parse` + `JSON.stringify` the file: it rewrites the escapes and formatting of every other entry.
   ```json
   "<id>": {
     "url": "<the maker's download URL>",
     "file": "cad/<id>/<file>.step",
     "license": "<as stated by the maker, or 'not stated (<where you got it>)'>"
   }
   ```
   Optional fields, only when needed:

   | Field | Use |
   |---|---|
   | `rotate: [["x", 90]]` | Turn the part into its mounting pose (step 3). Steps apply in order, in the STEP's own Z-up frame |
   | `files: [...]` | Several files in one assembly frame (enclosure + PCBA). Check they line up |
   | `reader: "native"` | Files too big for WebAssembly, or IGES that fails (needs `OCP_PYTHON` with `cadquery-ocp`) |
   | `hideMeshes: ["_FOV"]` / `keepBox: [[x,y,z],[x,y,z]]` | Drop field-of-view cones, keep-outs, spare accessories, the rest of an arm |
   | `colorMap: {"868686": [0.06, 0.06, 0.07]}`, `defaultColor: [r, g, b]` | Real finishes for CAD placeholder colours (0–1 floats) |
   | `triangleBudget` | Default 120,000. Big boards land at 1.5–3 MB, which is fine; lower it only for a huge file |
   | `note` | Anything a future maintainer needs to know (why a file was chosen or patched) |
3. Convert, then restore the stats file's formatting (the converter writes it with 1-space indent):
   ```bash
   node tools/parts/convert-step.mjs <id>
   ```
   ```bash
   npx prettier --write src/data/component-meshes.json
   ```
   This writes `public/parts/<id>.glb` (committed) and the part's size and origin into `src/data/component-meshes.json`.

### 2B. Maker robot description (URDF / MJCF + meshes)

Some makers publish a description instead of an assembly (grippers, hands). Add `urdf` or `mjcf` plus `meshDir` (and `rootLink`, `colors`, `modelColors: false` as needed) to `sources.json`, then `node tools/parts/convert-urdf.mjs <id>` and the same Prettier step. It assembles the meshes at the zero pose.

### 2C. Checked third-party CAD

Only when the maker publishes drawings but no CAD (or the file comes from a reseller): a third-party STEP may ship if you **measure it against the official drawing first**. Outline, mounting holes and connector or flange positions within about 0.1 mm. Record what you checked in the `license` / `note` text, and use `model: { source: 'checked', by: '<author>', checkedAgainst: '<maker>' }`. If no file passes, use 2D.

### 2D. No usable CAD: the studio's agent models it from the drawing

1. Create `tools/parts/specs/<id>/record.json` (copy the shape of `tools/parts/specs/teensy-41/record.json`: name, manufacturer, mpn, description, specs, `dimensions.envelope` and `dimensions.features` each with its `source`, links, notes, and `pose`: one of `servo`, `motor`, `board`, `camera`, `gripper`, `hand`, `lidar`, `battery`, `cell`). Put the official drawing images beside it (PNG crops of the dimensioned views read best).
2. Run `node tools/parts/generate.mjs <id>`. It runs the real app headless with the configured agent (it must be signed in), models the part, runs a verification pass and writes `public/parts/<id>.glb`, plus `tools/parts/generated/<id>/` with renders, `parts.json` and `notes.md`. It takes several minutes; run it in the background.
3. Read `notes.md` (every dimension: official vs measured) and look at the renders. Anything “Not dimensioned” stays plain, never invented. Rerun or fix the record until the table is all OK.
4. Use `model: { source: 'agent', by: '<maker whose drawing it is>' }`.

**Never hand-model a component or estimate one.** If none of these paths works (CAD behind a sign-in, no drawing), stop and tell the person what's missing; AGENTS.md §8a keeps a list of such parts.

## 3. Pose and measure the mesh

The mesh frame is **Y up, millimetres, centred on its bounding box**. Parts sit the way they're mounted:

| Kind | Pose |
|---|---|
| Servo | Case bottom down, output shaft up (+Y), long side along X |
| Motor | Body down, output shaft up |
| Board | PCB flat, component side up, long side along X |
| Camera | Upright as mounted, lenses facing +Z |
| Gripper / hand | Flange or wrist down, fingers up |
| LiDAR | Mounting face down, scan plane horizontal |
| Battery / cell | Flat on its largest face, long side along X / on its side, axis along X |

Run the probe; it reads the GLB and prints the bounding box, colours, the surfaces at the centre, a height map seen from above, and every through-hole with its diameter and the faces around it:

```bash
node tools/parts/probe.mjs <id>
```
`--axis=x|z` probes sideways (holes in a servo's side, a camera's back); `--cols=120` gives a finer map.

- **Orientation:** the tallest things (headers, shafts, lenses) should be where the pose says. If not, add or change `rotate` in `sources.json`, convert again and re-probe.
- **Against the drawing:** envelope, hole pattern and diameter, PCB or flange thickness, connector overhangs. Expect agreement within about 0.1 mm. If the CAD disagrees with the maker's own drawing, say so to the person and record it in `note`; don't silently pick one.

Done when the pose is right and the probe's numbers match the drawing.

## 4. Write the catalog entry

Add one `ComponentInfo` to `COMPONENTS` in `src/data/components.ts`, next to similar parts of its group. Copy the shape of a neighbour (the Raspberry Pi Zero 2 W and Radxa ZERO 3W entries are good boards; the STS3215 is a full servo). All text follows AGENTS.md §3; run its checklist (§3d) on every string.

| Field | Rule |
|---|---|
| `id` | From step 1. Must equal the GLB file name and the `sources.json` key |
| `name` | Maker + model as the maker writes it (“Radxa ZERO 3W”). No variant unless it changes the shape |
| `manufacturer`, `mpn` | The maker, and the exact MPN / SKU of the variant the links point at; add the variant in brackets when the SKU is cryptic (“RS107-D2E0H1W15 (2 GB, header fitted)”) |
| `group` | One of `ComponentGroup` at the top of the file. Don't add a group without the person's OK (it adds a Browse row) |
| `description` | One sentence, about 120 characters, saying what it is and why you'd pick it. No marketing (“high-performance”, “unparalleled”) |
| `specs` | 4–6 rows `[label, value]`. Short labels (CPU, RAM, Stall torque, Range, Voltage, Weight). Several facts → a list (`['Wi-Fi 6', 'Bluetooth 5.4']`), never `·`, `|` or `•` between them. Units in the text (`5 V, 2 A`, `19.5 kg·cm @ 7.4 V`). `keySpecs.ts` reads `RAM`/`Memory` for Computers, `Wireless` for Microcontrollers: use those labels |
| `mounting` | What a bracket designer needs, from the probe and drawing: envelope, hole count, Ø, pattern and inset, thread if tapped, shaft or spline, connector overhangs, what sticks out above and below. Plain sentences with numbers |
| `links.amazon` | `{ url: 'https://www.amazon.com/dp/<ASIN>', kind: 'product' }` only for the verified exact listing; otherwise `{ url: 'https://www.amazon.com/s?k=<maker+model>', kind: 'search' }`. Never guess an ASIN |
| `links.product`, `links.datasheet` | The maker's pages |
| `model` | `{ source: 'manufacturer', by: '<maker>', url: '<download page>', license?: '<only if stated>' }`, or `checked` / `agent` as in step 2 |
| `color` | The part's main colour as hex (PCB green `#1f6b3a`, black plastic `#1d1d1f`) |
| `pairsWith` | Catalog keys it's used with: `'hardware:socket_head|M2.5|6'`, `'component:<id>'` |
| `keywords` | Lowercase search words people type: model aliases, chip, family, common misspellings |

Typed data the engineering checks read (§8b), required for these groups, each with a `source` URL:

- **Servos / actuators:** `actuator` (stall and rated torque at volts, rpm, bus, currents, `curve` for other voltages) or `variants` with one `actuator` each. Use `kgcm()` for kg·cm values.
- **Linear actuators:** `variants` with `linear`.
- **Power:** `battery` (nominal and full volts, Ah, C), `regulator` (input range, output volts and amps), `holder` (cell format, count, series).

## 5. Mounting ports

Ports let the agent `mate` and `fasten` to the part. Add an entry to `COMPONENT_PORTS` in `src/data/componentPorts.ts`, in the **mesh frame** (the probe's numbers), using the helpers there:

- `board(name, { center, span, faces: [bottom, top] }, hole)`: four holes in a rectangle, ported on both faces (boards, cameras, IMUs).
- `points`, `grid`, `circle` (a bolt circle), `output` (a servo spline), `boss`, `face` (a lens or flat datum), `hole`.
- Hole spec: `{ kind: 'bore' | 'screw', thread: 'M2.5', diameterMm, depthMm? }`. `bore` is a clearance hole, `screw` a tapped one.

The probe prints exactly what `board` needs: hole centres (→ `center` and `span`), Ø, and the `faces`. Then run the test that casts into the shipped mesh at every port:

```bash
npx vitest run src/data/componentPorts.test.ts -t <id>
```

A part with no holes or datums (a cell, a pin-mounted dev board) gets no ports; say so in `mounting`.

## 6. List price

Add `'component:<id>'` (or `'component:<id>|<variant>'`) to `LIST_PRICES` in `src/data/listPrices.ts`: `{ usd, per, store, url, seen }`.

- From the maker's own store or a US distributor (DigiKey, Mouser, Adafruit, Pololu, RobotShop, PiShop…), **never Amazon** (the app never quotes Amazon prices).
- The price of the **same variant** the Amazon link and MPN name; say the variant in `store` when the store sells several.
- `seen` is today's date (`YYYY-MM-DD`).
- Shopify stores (many makers' shops) list every variant's price at `https://<store>/products/<handle>.json`.

## 7. Verify and hand off

```bash
npm run check
```
It must pass (format, lint, types, tests). Don't start the app, previews or screenshots to judge how it looks (AGENTS.md §15): tell the person what to check instead, e.g. “Parts → Computers → Radxa ZERO 3W: thumbnail, hover card, the part page's specs; add it to the canvas; Build → Parts to buy shows ≈ $39.99.”

Files a new part touches (and nothing else should change):

- `tools/parts/sources.json` (2A–2C) or `tools/parts/specs/<id>/` + `tools/parts/generated/<id>/` (2D)
- `public/parts/<id>.glb` and `src/data/component-meshes.json` (one new entry)
- `src/data/components.ts`, `src/data/componentPorts.ts`, `src/data/listPrices.ts`
- Never `tools/parts/cad/` (downloads, gitignored) or your scratch probes (`scratch/`).

Check `git status` and `git diff --stat`: if `sources.json` or `component-meshes.json` shows hundreds of changed lines, the formatting was rewritten; redo the edit as text or run Prettier on it.

## Pitfalls seen so far

- `sources.json` round-tripped through `JSON.stringify` rewrites every `—` escape: edit it as text.
- `convert-step.mjs` rewrites `component-meshes.json` with 1-space indent: run Prettier on it.
- A straight `'` inside a single-quoted TS string ends the string; use `’` (as other entries do) or rephrase.
- CAD placeholder colours (SolidWorks lavender `#cad1ee`) turn grey automatically; other odd CAD colours need `colorMap`.
- A drawing's dimension can look symmetric while the CAD isn't (Radxa's holes are 3.55–3.6 mm from the edges): report what the mesh measures, rounded honestly.
- Amazon titles name variants loosely (“with GPIO” = header pre-soldered). Match the maker's SKU table, and make sure the mesh shows that variant (a header in the STEP or not).
