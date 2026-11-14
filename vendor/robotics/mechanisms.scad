// Basecase mechanism generators: gears, GT2 pulleys, four-bar linkages, snap pins, a
// print-in-place hinge. They need BOSL2's gear, joiner and hinge libraries, so include this
// file after robotics.scad, only in parts that use it:
//   include <robotics.scad>
//   include <mechanisms.scad>
// Every module reports its interfaces with PORT echoes (see recipes.scad).

include <BOSL2/gears.scad>
include <BOSL2/joiners.scad>
include <BOSL2/hinges.scad>

// ---------------------------------------------------------------- spur gears
// Center distance of a spur pair (BOSL2 gear_dist, with its automatic profile shift).
function gear_pair_dist(t1, t2, mod = 1.5) = gear_dist(mod = mod, teeth1 = t1, teeth2 = t2);

// Spur gear pair for printing (backlash 0.1 mm, 20° pressure angle). Gear 1 at the origin, gear 2
// on +X at gear_pair_dist, phased so they mesh; both stand on z = 0, thick tall. bore = 0 for
// none. horn1 = true replaces gear 1's bore with the STS3215 horn pattern (4 x M3 on Ø14,
// Ø6.5 center) so it bolts straight to a servo. part = "both" | "gear1" | "gear2".
module gear_pair(t1 = 12, t2 = 36, mod = 1.5, thick = 6, bore1 = 5, bore2 = 8, part = "both", backlash = 0.1, horn1 = false) {
  d = gear_pair_dist(t1, t2, mod);
  if (part != "gear2") {
    difference() {
      spur_gear(mod = mod, teeth = t1, thickness = thick, backlash = backlash, gear_spin = -90, anchor = BOT);
      if (horn1) {
        cyl(d = 6.5, h = 3 * thick);
        for (a = [0 : 90 : 270]) zrot(a) right(7) cyl(d = screw_clear_d(3), h = 3 * thick);
      }
      if (!horn1 && bore1 > 0) cyl(d = bore1, h = 3 * thick);
    }
    port("axis_1", [0, 0, thick], [0, 0, 1], horn1 ? "hole_circle" : "bore", horn1 ? 14 : bore1);
  }
  if (part != "gear1") {
    translate([d, 0, 0]) difference() {
      spur_gear(mod = mod, teeth = t2, thickness = thick, backlash = backlash, gear_spin = -90 + (t2 % 2 == 0 ? 180 / t2 : 0), anchor = BOT);
      if (bore2 > 0) cyl(d = bore2, h = 3 * thick);
    }
    port("axis_2", [d, 0, thick], [0, 0, 1], "bore", bore2);
  }
}

// ---------------------------------------------------------------- GT2 belt drive
// GT2 (2 mm pitch). Pitch diameter = teeth x 2 / pi; the outside diameter sits 0.254 mm inside the
// belt's pitch line on each side. Grooves use the 0.555 mm tooth radius and 0.76 mm depth common to
// printed GT2 pulleys (an approximation of the Gates profile: print one and test it on the belt).
function gt2_pd(teeth) = teeth * 2 / PI;
// Center distance for a closed belt of belt_teeth teeth over pulleys of t1 and t2 teeth.
function gt2_center(t1, t2, belt_teeth) =
  let(L = belt_teeth * 2, s = gt2_pd(t1) + gt2_pd(t2), dd = gt2_pd(t1) - gt2_pd(t2), b = 4 * L - 2 * PI * s)
  (b + sqrt(b * b - 32 * dd * dd)) / 16;

// GT2 pulley on z = 0, flanges both sides, belt = belt width. Axis = Z.
module gt2_pulley(teeth = 20, belt = 6, bore = 5, flange = 1.2, name = "axis") {
  od = gt2_pd(teeth) - 0.508;
  fd = od + 3;
  h = belt + 1 + 2 * flange;
  difference() {
    union() {
      cyl(d = fd, h = flange, anchor = BOT, chamfer1 = 0.4);
      up(flange - 0.01) cyl(d = od, h = belt + 1 + 0.02, anchor = BOT);
      up(h - flange) cyl(d = fd, h = flange, anchor = BOT, chamfer2 = 0.4);
    }
    for (i = [0 : teeth - 1]) zrot(i * 360 / teeth) right(od / 2 + 0.555 - 0.76) up(flange) cyl(r = 0.555, h = belt + 1, anchor = BOT, $fn = 16);
    if (bore > 0) cyl(d = bore, h = 3 * h);
  }
  port(name, [0, 0, h], [0, 0, 1], "bore", bore);
}

// Two GT2 pulleys on one closed belt: pulley 1 at the origin, pulley 2 on +X at gt2_center.
// part = "both" | "pulley1" | "pulley2".
module gt2_pulley_pair(t1 = 20, t2 = 40, belt_teeth = 100, belt = 6, bore1 = 5, bore2 = 8, part = "both") {
  c = gt2_center(t1, t2, belt_teeth);
  assert(c > (gt2_pd(t1) + gt2_pd(t2)) / 2 + 3, str("gt2_pulley_pair: a ", belt_teeth, "-tooth belt is too short for these pulleys"));
  if (part != "pulley2") gt2_pulley(t1, belt, bore1, name = "axis_1");
  if (part != "pulley1") placed([c, 0, 0]) gt2_pulley(t2, belt, bore2, name = "axis_2");
}

// ---------------------------------------------------------------- four-bar linkage
// Ground pivots A = [0, 0] and D = [ground, 0]; crank AB, coupler BC, rocker DC.
// four_bar_pose returns [B, C] for crank angle theta (open branch), or undef when it can't close.
function four_bar_pose(ground, crank, coupler, rocker, theta) =
  let(B = crank * [cos(theta), sin(theta)], D = [ground, 0], v = D - B, e = norm(v))
  e > coupler + rocker || e < abs(coupler - rocker) ? undef :
  let(phi = atan2(v.y, v.x), alpha = acos((coupler * coupler + e * e - rocker * rocker) / (2 * coupler * e)))
  [B, B + coupler * [cos(phi + alpha), sin(phi + alpha)]];
// Grashof: true when the shortest link can turn fully.
function four_bar_grashof(ground, crank, coupler, rocker) =
  let(l = sort([ground, crank, coupler, rocker])) l[0] + l[3] <= l[1] + l[2];
// The coupler point [px, py] in the coupler's frame (along B→C, then to its left), at crank angle theta.
function four_bar_point(B, C, coupler, px, py) =
  let(u = (C - B) / coupler, n = [-u.y, u.x]) B + px * u + py * n;

module _rcp_bar(p, q, w, t, pin) {
  difference() {
    hull() for (c = [p, q]) translate([c.x, c.y, 0]) cyl(d = w, h = t, anchor = BOT, chamfer = 0.4);
    for (c = [p, q]) translate([c.x, c.y, 0]) cyl(d = pin + 0.3, h = 3 * t);
  }
}

module _rcp_plate(pts, w, t, pin) {
  difference() {
    hull() for (c = pts) translate([c.x, c.y, 0]) cyl(d = w, h = t, anchor = BOT, chamfer = 0.4);
    for (c = pts) translate([c.x, c.y, 0]) cyl(d = pin + 0.3, h = 3 * t);
  }
}

// Four-bar linkage as flat bars with pin holes (pin + 0.3 mm clearance, for M3 shoulder screws or
// 3 mm pins), posed at crank angle theta. Layers: ground and crank-rocker at z = 0 and t, coupler
// on top; with a coupler point [px, py] off the B–C line, the coupler is a plate through B, C and P.
// part = "all" | "ground" | "crank" | "coupler" | "rocker", and each part reports its own pivots.
module four_bar(ground = 60, crank = 20, coupler = 60, rocker = 45, theta = 60, px = 0, py = 0, w = 8, t = 4, pin = 3, part = "all") {
  pose = four_bar_pose(ground, crank, coupler, rocker, theta);
  assert(!is_undef(pose), "four_bar: the links can't close at this crank angle");
  B = pose[0];
  C = pose[1];
  D = [ground, 0];
  P = four_bar_point(B, C, coupler, px, py);
  point = px != 0 || py != 0;
  all = part == "all";
  if (all || part == "ground") _rcp_bar([0, 0], D, w, t, pin);
  if (all || part == "crank") up(t + 0.2) _rcp_bar([0, 0], B, w, t, pin);
  if (all || part == "rocker") up(t + 0.2) _rcp_bar(D, C, w, t, pin);
  if (all || part == "coupler") up(2 * t + 0.4) _rcp_plate(point ? [B, C, P] : [B, C], w, t, pin);
  if (all || part == "ground" || part == "crank") port("A", [0, 0, 0], [0, 0, -1], "bore", pin);
  if (all || part == "ground" || part == "rocker") port("D", [D.x, D.y, 0], [0, 0, -1], "bore", pin);
  if (all || part == "crank" || part == "coupler") port("B", [B.x, B.y, 3 * t + 0.4], [0, 0, 1], "bore", pin);
  if (all || part == "rocker" || part == "coupler") port("C", [C.x, C.y, 3 * t + 0.4], [0, 0, 1], "bore", pin);
  if (point && (all || part == "coupler")) port("P", [P.x, P.y, 3 * t + 0.4], [0, 0, 1], "bore", pin);
}

// ---------------------------------------------------------------- snap pins
// BOSL2 snap pin, lying flat for printing (size "standard" | "medium" | "small" | "tiny").
module snap_pin_part(size = "standard") snap_pin(size);

// Socket for a snap pin (cutter), mouth at the origin, going down -Z.
module snap_socket_cut(size = "standard") {
  snap_pin_socket(size, anchor = TOP, orient = DOWN);
  port("snap", [0, 0, 0], [0, 0, 1], "bore");
}

// ---------------------------------------------------------------- print-in-place hinge
// Two leaves (t thick, leaf wide) joined by a BOSL2 knuckle hinge with interlocking cones, printed
// flat in one piece. Axis along X at z = offset; leaf 1 on -Y, leaf 2 on +Y; gap = knuckle
// clearance (0.3 mm separates on a 0.4 mm nozzle). part = "both" | "leaf1" | "leaf2".
module pip_hinge(length = 40, segs = 5, knuckle = 6, offset = 4, leaf = 20, t = 3, gap = 0.3, part = "both") {
  if (part != "leaf2") {
    down(0.2) knuckle_hinge(length = length, segs = segs, offset = offset, in_place = true, knuckle_diam = knuckle, gap = gap);
    translate([-length / 2, -leaf - knuckle / 2 - 0.6, -t]) cube([length, leaf, t]);
  }
  if (part != "leaf1") {
    down(0.2) zrot(180) knuckle_hinge(length = length, segs = segs, offset = offset, inner = true, in_place = true, knuckle_diam = knuckle, gap = gap);
    translate([-length / 2, knuckle / 2 + 0.6, -t]) cube([length, leaf, t]);
  }
  port("axis", [length / 2, 0, offset - 0.2], [1, 0, 0], "bore");
}

// ---------------------------------------------------------------- cycloidal reducer
// Disc profile for a cycloidal drive with ratio lobes and ratio + 1 ring pins of Ø pin_d on
// radius pin_r, eccentricity ecc: the pin-center path offset inward by pin_d / 2 + fit, sampled
// at 32 points per lobe, in the disc's own frame.
function cycloid_profile(ratio = 15, pin_r = 36, pin_d = 5.5, ecc = 1.25, fit = 0.15) =
  let(n = ratio + 1, r = pin_d / 2 + fit, samples = 32 * ratio)
  [for (i = [0 : samples - 1]) let(
    s = 360 * i / samples,
    q = [pin_r * cos(s) - ecc * cos(n * s), pin_r * sin(s) - ecc * sin(n * s)],
    t = [-pin_r * sin(s) + ecc * n * sin(n * s), pin_r * cos(s) - ecc * n * cos(n * s)]
  ) q + r * [-t.y, t.x] / norm(t)];

// Outermost radius a posed disc reaches from the drive axis.
function cycloid_reach(pin_r, pin_d, ecc, fit) = pin_r + 2 * ecc - pin_d / 2 - fit;

module _cyc_disc(prof, z, turn, center, input, lobes, disc_t, disc_bore, out_pins, out_pin_r, hole_d) {
  translate([center.x, center.y, z]) rotate(-input / lobes) linear_extrude(height = disc_t) difference() {
    rotate(turn) polygon(prof);
    circle(d = disc_bore);
    for (j = [0 : out_pins - 1]) rotate(360 * j / out_pins) translate([out_pin_r, 0]) circle(d = hole_d);
  }
}

// ISO 7380 button head [diameter, height]: low enough to sit in the 4 mm base under the discs.
function cyc_button_head(m) = m == 3 ? [5.7, 1.65] : m == 4 ? [7.6, 2.2] : [9.5, 2.75];

module _cyc_housing(n, pin_r, pin_d, wall, housing_h, bolt_circle, bolt_m, reach, ins_r) {
  housing_r = pin_r + pin_d / 2 + wall;
  head = cyc_button_head(bolt_m);
  seat = 4.8 - head[1];
  difference() {
    union() {
      cyl(r = housing_r, h = 4, anchor = BOT);
      difference() {
        cyl(r = housing_r, h = housing_h, anchor = BOT);
        down(1) cyl(r = pin_r + pin_d / 2, h = housing_h + 2, anchor = BOT);
      }
      for (k = [0 : n - 1]) zrot(360 * k / n) translate([pin_r, 0, 3.8]) {
        cyl(d = pin_d, h = housing_h - 7.8, anchor = BOT, chamfer2 = 0.4);
        translate([0, -pin_d / 4, 0]) cube([pin_d / 2 + wall / 2, pin_d / 2, housing_h - 7.8]);
      }
      for (k = [0 : 5]) zrot(30 + 60 * k) translate([ins_r, 0, 3.8]) cyl(d = housing_r - reach - 0.7, h = housing_h - 3.8, anchor = BOT);
    }
    cyl(d = 22, h = 20);
    for (k = [0 : 3]) let(a = 45 + 90 * k) placed([bolt_circle / 2 * cos(a), bolt_circle / 2 * sin(a), seat]) {
      down(seat + 0.01) cyl(d = screw_clear_d(bolt_m), h = seat + 0.02, anchor = BOT);
      cyl(d = head[0] + 0.6, h = 4 - seat + 0.01, anchor = BOT);
      port(str("motor_bolt_", k), [0, 0, 0], [0, 0, 1], "screw", bolt_m);
    }
    for (k = [0 : 5]) let(a = 30 + 60 * k) placed([ins_r * cos(a), ins_r * sin(a), housing_h]) {
      heatset_hole(3, insert_len(3));
      port(str("cover_boss_", k), [0, 0, 0], [0, 0, 1], "boss", 3);
    }
  }
  port("motor", [0, 0, 0], [0, 0, -1], "face");
  port("mount", [0, 0, 0], [0, 0, -1], "hole_circle", bolt_circle);
}

module _cyc_cover(housing_r, housing_h, stage_h, out_bearing_d, ins_r) {
  top = stage_h - 1;
  difference() {
    up(housing_h) cyl(r = housing_r, h = top - housing_h, anchor = BOT, rounding2 = 1);
    down(0.01) cyl(d = out_bearing_d, h = stage_h - 2 + 0.01, anchor = BOT);
    cyl(d = out_bearing_d - 4, h = 3 * stage_h);
    for (k = [0 : 5]) let(a = 30 + 60 * k) placed([ins_r * cos(a), ins_r * sin(a), top]) {
      up(0.01) cyl(d = screw_clear_d(3), h = top - housing_h + 1.02, anchor = TOP);
      port(str("cover_screw_", k), [0, 0, 0], [0, 0, 1], "screw", 3);
    }
  }
  port("bearing", [0, 0, stage_h - 2], [0, 0, 1], "bore", out_bearing_d);
}

module _cyc_output(housing_h, stage_h, out_pins, out_pin_d, out_pin_r, out_bearing_d) {
  carrier_r = out_pin_r + out_pin_d / 2 + 3;
  hub_d = 30;
  difference() {
    union() {
      up(housing_h - 4) cyl(r = carrier_r, h = 4, anchor = BOT, chamfer1 = 0.6);
      for (j = [0 : out_pins - 1]) zrot(360 * j / out_pins) translate([out_pin_r, 0, 5.5])
        cyl(d = out_pin_d, h = housing_h - 4 - 5.5 + 0.2, anchor = BOT, chamfer1 = 0.4);
      up(housing_h - 0.2) cyl(d = hub_d, h = stage_h - housing_h + 0.2, anchor = BOT, chamfer2 = 0.4);
    }
    cyl(d = 14, h = 3 * stage_h);
    up(housing_h - 0.4) difference() {
      cyl(r = carrier_r + 1, h = 1, anchor = BOT);
      down(1) cyl(d = (hub_d + out_bearing_d) / 2, h = 3, anchor = BOT);
    }
    for (k = [0 : 3]) zrot(90 * k) translate([10, 0, stage_h]) heatset_hole(3, insert_len(3));
  }
  port("output", [0, 0, stage_h], [0, 0, 1], "hole_circle", 20);
}

module _cyc_shaft(ecc, disc_t, gap, cam_d, shaft_d) {
  top = 5 + 2 * disc_t + gap;
  difference() {
    union() {
      up(1) cyl(d = 16, h = top - 1, anchor = BOT, chamfer1 = 0.4);
      translate([ecc, 0, 5]) cyl(d = cam_d, h = disc_t, anchor = BOT);
      translate([-ecc, 0, 5 + disc_t + gap]) cyl(d = cam_d, h = disc_t, anchor = BOT);
    }
    cyl(d = shaft_d + 0.2, h = 3 * top);
    up(3) ycyl(d = tap_pilot_d(3), h = 20, anchor = FRONT);
  }
}

// Printed cycloidal reducer on a motor face: ratio lobes, ratio + 1 fixed ring pins in the
// housing, two discs 180° apart on an eccentric sleeve (one 6804 bearing in each disc's bore),
// and an output carrier whose out_pins pins run in the discs' holes, held by a 6806 in the cover.
// The output turns -input / ratio. Axis = Z, the motor's stator face is z = 0 with the motor below;
// every part is modeled in this one frame, so each compiles in place. input = input shaft angle
// (degrees) to pose the moving parts. part = "housing" | "cover" | "disc1" | "disc2" | "output" |
// "shaft" | "all" (assembled). Screws: 4 × bolt_m × 8 button heads through the base into the motor,
// 6 × M3 × 14 through the cover into inserts in the housing wall, heads on the cover.
module cycloidal_drive(ratio = 15, pin_r = 36, pin_d = 5.5, ecc = 1.25, fit = 0.15, disc_t = 8, gap = 0.5,
                       cam_d = 20, disc_bore = 32, out_pins = 6, out_pin_d = 5, out_pin_r = 23, hole_d = 7.9, wall = 4,
                       housing_h = 26, stage_h = 35, shaft_d = 10, bolt_circle = 44, bolt_m = 4, out_bearing_d = 42,
                       input = 0, part = "all") {
  $fa = 4;
  $fs = 0.5;
  lobes = ratio;
  housing_r = pin_r + pin_d / 2 + wall;
  reach = cycloid_reach(pin_r, pin_d, ecc, fit);
  ins_r = (reach + 0.5 + housing_r) / 2;
  all = part == "all";
  prof = all || part == "disc1" || part == "disc2" ? cycloid_profile(ratio, pin_r, pin_d, ecc, fit) : [];
  if (all || part == "housing") _cyc_housing(ratio + 1, pin_r, pin_d, wall, housing_h, bolt_circle, bolt_m, reach, ins_r);
  if (all || part == "cover") _cyc_cover(housing_r, housing_h, stage_h, out_bearing_d, ins_r);
  if (all || part == "disc1")
    _cyc_disc(prof, 5, 0, ecc * [cos(input), sin(input)], input, lobes, disc_t, disc_bore, out_pins, out_pin_r, hole_d);
  if (all || part == "disc2")
    _cyc_disc(prof, 5 + disc_t + gap, -180 / lobes, ecc * [cos(input + 180), sin(input + 180)], input, lobes, disc_t, disc_bore, out_pins, out_pin_r, hole_d);
  if (all || part == "output") zrot(-input / lobes) _cyc_output(housing_h, stage_h, out_pins, out_pin_d, out_pin_r, out_bearing_d);
  if (all || part == "shaft") {
    zrot(input) _cyc_shaft(ecc, disc_t, gap, cam_d, shaft_d);
    port("input", [0, 0, 1], [0, 0, -1], "bore", shaft_d);
  }
}
