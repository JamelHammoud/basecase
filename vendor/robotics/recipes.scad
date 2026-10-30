// Basecase recipes: proven printable features that report their interfaces.
// Included by robotics.scad (include <robotics.scad> loads it); don't include it on its own.
// The find_recipes tool lists every module here with its parameters, ports and a snippet that compiles.
//
// Ports: each module echoes its interfaces as
//   echo("PORT", name, [x, y, z], [ax, ay, az], kind[, diameter])
// kind is bore | boss | face | output | hole_circle | screw. The axis points out of the part,
// toward where the mating part, screw or tool comes from. Positions are in the part's frame
// when the module is placed with placed() (or sits at the origin); a plain translate() or
// rotate() moves the geometry but not the reported ports.
// Every add-on feature (boss, rib) sinks 0.2 mm below its base plane, so it fuses with the
// surface it stands on instead of touching it face to face.

$ports = true;
$port_tf = ident(4);
$port_prefix = "";
$inset = 0;

function rcp_round(v) = is_list(v) ? [for (x = v) rcp_round(x)] : round(v * 100) / 100 + 0;

// Report one port (see above). d is optional (a bore, boss or screw diameter, or a bolt circle).
module port(name, pos, axis, kind, d) {
  p = apply($port_tf, pos);
  a = unit(apply($port_tf, axis) - apply($port_tf, [0, 0, 0]));
  if ($ports && is_undef(d)) echo("PORT", str($port_prefix, name), rcp_round(p), rcp_round(a), kind);
  if ($ports && !is_undef(d)) echo("PORT", str($port_prefix, name), rcp_round(p), rcp_round(a), kind, d);
}

module _rcp_frame(tf, prefix) {
  $port_tf = tf;
  $port_prefix = prefix;
  children();
}

// Place children (rotate by r, XYZ degrees, then move to pos) so their ports move with them.
// prefix is prepended to their port names, e.g. "left_".
module placed(pos = [0, 0, 0], r = [0, 0, 0], prefix = "") {
  m = move(pos) * rot(r);
  _rcp_frame($port_tf * m, str($port_prefix, prefix)) multmatrix(m) children();
}

// ---------------------------------------------------------------- fastener data (ISO 4762, ISO 273, CNC Kitchen)
function screw_clear_d(m) = m == 2 ? 2.4 : m == 2.5 ? 2.9 : m == 3 ? 3.4 : m == 4 ? 4.5 : 5.5;
function socket_head(m) = m == 2 ? [3.8, 2] : m == 2.5 ? [4.5, 2.5] : m == 3 ? [5.5, 3] : m == 4 ? [7, 4] : [8.5, 5];
function insert_len(m) = m == 2 ? 3 : m == 2.5 ? 4 : m == 3 ? 5.7 : 8.1;
function insert_hole_d(m) = m == 2 ? 3.35 : m == 2.5 ? 3.75 : m == 4 ? 5.45 : 4.15;
function insert_boss_d(m) = insert_hole_d(m) + 3.2;
function tap_pilot_d(m) = m == 2 ? 1.6 : m == 2.5 ? 2.1 : m == 3 ? 2.5 : 3.3;
STOCK_SCREW_LENGTHS = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 45, 50];
// Screw into a heat-set insert: [length, grip]. length = the longest stock screw that fits
// grip_max plus the insert (its hole runs 1 mm deeper); grip = the clamped length to use, shorter
// than grip_max when the counterbore must sink deeper so the thread engages the whole insert.
function screw_for(grip_max, m = 3, engage) =
  let(e = is_undef(engage) ? insert_len(m) : engage,
      l = max([0, for (k = STOCK_SCREW_LENGTHS) if (k <= grip_max + e + 1) k]))
  [l, min(grip_max, l - e)];

// Counterbored clearance hole (cutter). Origin on the outer surface; drills down −Z.
// The head sits sink below the surface. Port: the head seat.
module counterbore_cut(m = 3, depth = 10, sink = 0.4, name = "screw") {
  hd = socket_head(m);
  up(0.01) cyl(d = screw_clear_d(m), h = depth + 0.02, anchor = TOP);
  up(0.01) cyl(d = hd[0] + 0.6, h = hd[1] + sink + 0.01, anchor = TOP);
  port(name, [0, 0, -(hd[1] + sink)], [0, 0, 1], "screw", m);
}

// Pilot hole for a self-tapping screw (cutter), origin on the surface, drills −Z.
module tap_hole(m = 2, depth = 8, name = "tap") {
  up(0.01) cyl(d = tap_pilot_d(m), h = depth + 0.01, anchor = TOP);
  port(name, [0, 0, 0], [0, 0, 1], "bore", m);
}

// Boss with a heat-set insert hole in its top. Stands on z = 0 (fused 0.2 mm into the surface),
// top at z = h, with a flared root. Port: the insert mouth.
module heatset_boss(m = 3, h = 8, flare = 1, name = "boss") {
  d = insert_boss_d(m);
  difference() {
    union() {
      down(0.2) cyl(d = d, h = h + 0.2, anchor = BOT, chamfer2 = 0.4);
      if (flare > 0) down(0.2) cyl(d1 = d + 2 * flare, d2 = d, h = flare + 0.2, anchor = BOT);
    }
    up(h) heatset_hole(m, insert_len(m));
  }
  port(name, [0, 0, h], [0, 0, 1], "boss", m);
}

// Stiffening rib on z = 0 against a wall at x = 0, running along +X. gusset = true tapers it
// from h at the wall to 0 at x = l (a gusset); false keeps it h tall with a chamfered end.
// Thickness: 40–60 % of the wall, at least 1.5 mm.
module rib(l = 20, h = 10, t = 1.6, gusset = true) {
  pts = gusset ? [[-0.2, -0.2], [l, -0.2], [-0.2, h]] : [[-0.2, -0.2], [l, -0.2], [l, h - min(h, l) * 0.3], [l - min(h, l) * 0.3, h], [-0.2, h]];
  xrot(90) linear_extrude(height = t, center = true) polygon(pts);
}

// Vent slots (cutter): n slots across X at pitch, each l long along Y and w wide, cut down
// from the surface at z = 0 to depth.
module vent_slots(n = 5, l = 16, w = 2.4, pitch = 5, depth = 4) {
  for (i = [0 : n - 1]) right((i - (n - 1) / 2) * pitch) up(0.1)
    cuboid([w, l, depth + 0.2], rounding = w / 2 - 0.01, edges = "Z", anchor = TOP);
}

// A printed block with a radius in plan, a 45° chamfer on the bed edge (prints without an
// elephant's foot or overhang) and a rounded top edge. Bottom at z = 0, centered in XY.
module printed_block(size = [40, 30, 12], r = 4, top = 1, bed = 0.6) {
  _rcp_inset(0) shell_box(size, r, top, bed);
  port("bottom", [0, 0, 0], [0, 0, -1], "face");
  port("top", [0, 0, size.z], [0, 0, 1], "face");
}

// Joint disc: a flange on z = 0..t with a center bore and a bolt circle. fix = "through"
// (counterbored from the top), "insert" (heat-set inserts from the top; needs t ≥ insert + 1)
// or "tap" (self-tapping pilots). Use it for joint covers, horn adapters and turntables.
module joint_disc(d = 40, t = 6, bore = 8, bc = 30, holes = 4, m = 3, fix = "through", chamfer = 0.6) {
  assert(fix != "insert" || t >= insert_len(m) + 1, str("joint_disc: inserts need t >= ", insert_len(m) + 1, " mm"));
  assert(fix != "through" || t >= socket_head(m)[1] + 2, str("joint_disc: counterbores need t >= ", socket_head(m)[1] + 2, " mm"));
  difference() {
    cyl(d = d, h = t, anchor = BOT, chamfer1 = chamfer, rounding2 = chamfer);
    if (bore > 0) cyl(d = bore, h = 3 * t + 2);
    for (i = [0 : holes - 1]) let(a = i * 360 / holes) placed([bc / 2 * cos(a), bc / 2 * sin(a), t]) {
      if (fix == "through") counterbore_cut(m, t + 1, name = str("bolt_", i));
      if (fix == "insert") heatset_hole(m, insert_len(m));
      if (fix == "tap") tap_hole(m, t + 1, name = str("bolt_", i));
    }
  }
  port("face", [0, 0, t], [0, 0, 1], "face");
  port("bottom", [0, 0, 0], [0, 0, -1], "face");
  if (bore > 0) port("bore", [0, 0, t], [0, 0, 1], "bore", bore);
  port("bolts", [0, 0, t], [0, 0, 1], "hole_circle", bc);
}

// ---------------------------------------------------------------- shells
// Rounded box for shells: plan radius r, rounded top edge, bed chamfer. Reads $inset, so
// split_shell can hollow and seam it (insets keep corners concentric: inside r = r - wall).
module shell_box(size = [80, 60, 40], r = 8, top = 4, bed = 0.6) {
  i = $inset;
  ri = max(r - i, 0.01);
  ti = min(max(top - i, 0), ri);
  h = size.z - 2 * i;
  c = [size.x / 2 - i - ri, size.y / 2 - i - ri];
  b = i == 0 ? min(bed, ri - 0.01) : 0;
  translate([0, 0, i]) hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * c.x, sy * c.y, 0]) {
    if (b > 0) cylinder(r1 = ri - b, r2 = ri, h = b);
    translate([0, 0, b]) cylinder(r = ri, h = h - ti - b);
    if (ti > 0.05) translate([0, 0, h - ti]) rotate_extrude() intersection() {
      translate([ri - ti, 0]) circle(r = ti);
      square([ri, ti]);
    }
  }
}

// Default screw towers for shell_box: one per corner, along the diagonal, fused 0.8 mm into the wall.
function shell_box_screws(size, r = 8, wall = 3, m = 3) =
  let(ri = max(r - wall, 0), d = (ri + 0.8 - insert_boss_d(m) / 2) / sqrt(2), c = [size.x / 2 - r + d, size.y / 2 - r + d])
  [for (sx = [-1, 1], sy = [-1, 1]) [sx * c.x, sy * c.y]];

module _rcp_inset(i) {
  $inset = i;
  children();
}

// Screw for split_shell with screws from the bottom ([length, grip]): through the base tower into
// the lid insert. The counterbores sink as deep as this needs.
function split_shell_screw(split, lip = 2.4, clr = 0.2, m = 3) =
  screw_for(split + lip + clr - socket_head(m)[1] - 0.4, m);

// Split shell from any body given as children that honours $inset (shell_box, silhouette_body,
// or your own module that shrinks by $inset). Hollows it to wall, cuts it at z = split into a
// base and a lid joined by a lip-and-step seam (lip on the base, groove in the lid, clr per side)
// with an outside shadow line (reveal), and adds screw towers at screws ([x, y] list):
// screw_side "bottom" puts the heads in counterbores on the bed face (z = 0) and the inserts in the
// lid; "top" puts the heads at top_z and the inserts in the base. part = "base" | "lid" | "both".
module split_shell(split, wall = 3, part = "base", lip = 2.4, clr = 0.2, reveal = 0.5, screws = [], m = 3,
                   screw_side = "bottom", top_z, boss_d) {
  lt = wall / 2 - clr / 2;
  bd = is_undef(boss_d) ? insert_boss_d(m) : boss_d;
  mouth = split + lip + clr;
  grip_bot = split_shell_screw(split, lip, clr, m)[1];
  grip_top = is_undef(top_z) ? 0 : screw_for(top_z - split - lip - socket_head(m)[1] - 0.4, m)[1];
  big = 4000;
  assert(screw_side == "bottom" || !is_undef(top_z), "split_shell: screws from the top need top_z");
  if (part != "lid") _rcp_frame($port_tf, str($port_prefix, part == "both" ? "base_" : "")) {
    difference() {
      union() {
        intersection() {
          difference() { _rcp_inset(0) children(); _rcp_inset(wall) children(); }
          translate([-big / 2, -big / 2, split - big]) cube(big);
        }
        intersection() {
          difference() { _rcp_inset(wall - lt) children(); _rcp_inset(wall) children(); }
          up(split - 0.2) cuboid([big, big, lip + 0.2], anchor = BOT);
        }
        intersection() {
          _rcp_inset(wall - 0.8) children();
          for (p = screws) translate([p.x, p.y, -1]) cyl(d = bd, h = split + lip + 1, anchor = BOT);
        }
      }
      intersection() {
        difference() { _rcp_inset(0) children(); _rcp_inset(reveal) children(); }
        up(split) cuboid([big, big, 2 * reveal], anchor = TOP);
      }
      for (k = idx(screws)) let(p = screws[k]) {
        if (screw_side == "bottom") placed([p.x, p.y, 0], [180, 0, 0]) counterbore_cut(m, split + lip + 1, sink = mouth - grip_bot - socket_head(m)[1], name = str("screw_", k));
        if (screw_side == "top") placed([p.x, p.y, split + lip]) { heatset_hole(m, insert_len(m)); port(str("boss_", k), [0, 0, 0], [0, 0, 1], "boss", m); }
      }
    }
    port("seam", [0, 0, split], [0, 0, 1], "face");
  }
  if (part != "base") _rcp_frame($port_tf, str($port_prefix, part == "both" ? "lid_" : "")) {
    difference() {
      union() {
        intersection() {
          difference() { _rcp_inset(0) children(); _rcp_inset(wall) children(); }
          translate([-big / 2, -big / 2, split]) cube(big);
        }
        intersection() {
          _rcp_inset(wall - 0.8) children();
          for (p = screws) translate([p.x, p.y, mouth]) cyl(d = bd, h = big, anchor = BOT);
        }
      }
      intersection() {
        _rcp_inset(wall - lt - clr) children();
        up(split - 0.01) cuboid([big, big, lip + clr + 0.01], anchor = BOT);
      }
      intersection() {
        difference() { _rcp_inset(0) children(); _rcp_inset(reveal) children(); }
        up(split) cuboid([big, big, 2 * reveal], anchor = BOT);
      }
      for (k = idx(screws)) let(p = screws[k]) {
        if (screw_side == "bottom") placed([p.x, p.y, mouth], [180, 0, 0]) { heatset_hole(m, insert_len(m)); port(str("boss_", k), [0, 0, 0], [0, 0, 1], "boss", m); }
        if (screw_side == "top") placed([p.x, p.y, top_z]) counterbore_cut(m, top_z - mouth + 1, sink = top_z - (split + lip) - grip_top - socket_head(m)[1], name = str("screw_", k));
      }
    }
    port("seam", [0, 0, split], [0, 0, -1], "face");
  }
}

// Shell box with a seam: shell_box hollowed and split by split_shell, with corner screw towers.
module seam_shell(size = [80, 60, 40], r = 8, wall = 3, split, part = "base", top = 4, bed = 0.6, lip = 2.4,
                  clr = 0.2, reveal = 0.5, m = 3, screws, screw_side = "bottom") {
  sp = is_undef(split) ? size.z / 2 : split;
  scr = is_undef(screws) ? shell_box_screws(size, r, wall, m) : screws;
  split_shell(sp, wall, part, lip, clr, reveal, scr, m, screw_side, top_z = size.z) shell_box(size, r, top, bed);
}

// Body from a front outline (x, z points) and a side outline (y, z; front = -y), softened by soft
// mm and intersected: the industrial-design way to sculpt heads, torsos and covers. Honours
// $inset, so split_shell can hollow and seam it.
module silhouette_body(front, side, soft = 6) {
  i = $inset;
  s = max(soft - i, 0.01);
  span = 2 * max([for (p = concat(front, side)) norm(p)]) + 20;
  intersection() {
    xrot(90) linear_extrude(height = span, center = true) offset(r = s) offset(delta = -s - i) polygon(front);
    rot([90, 0, 90]) linear_extrude(height = span, center = true) offset(r = s) offset(delta = -s - i) polygon(side);
  }
}
