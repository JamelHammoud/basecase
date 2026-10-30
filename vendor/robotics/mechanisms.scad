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

module _rcp_bar(p, q, w, t, pin) {
  difference() {
    hull() for (c = [p, q]) translate([c.x, c.y, 0]) cyl(d = w, h = t, anchor = BOT, chamfer = 0.4);
    for (c = [p, q]) translate([c.x, c.y, 0]) cyl(d = pin + 0.3, h = 3 * t);
  }
}

// Four-bar linkage as flat bars with pin holes (pin + 0.3 mm clearance, for M3 shoulder screws or
// 3 mm pins), posed at crank angle theta. Layers: ground and crank-rocker at z = 0 and t, coupler
// on top. part = "all" | "ground" | "crank" | "coupler" | "rocker".
module four_bar(ground = 60, crank = 20, coupler = 60, rocker = 45, theta = 60, w = 8, t = 4, pin = 3, part = "all") {
  pose = four_bar_pose(ground, crank, coupler, rocker, theta);
  assert(!is_undef(pose), "four_bar: the links can't close at this crank angle");
  B = pose[0];
  C = pose[1];
  D = [ground, 0];
  if (part == "all" || part == "ground") _rcp_bar([0, 0], D, w, t, pin);
  if (part == "all" || part == "crank") up(t + 0.2) _rcp_bar([0, 0], B, w, t, pin);
  if (part == "all" || part == "rocker") up(t + 0.2) _rcp_bar(D, C, w, t, pin);
  if (part == "all" || part == "coupler") up(2 * t + 0.4) _rcp_bar(B, C, w, t, pin);
  port("A", [0, 0, 0], [0, 0, -1], "bore", pin);
  port("D", [D.x, D.y, 0], [0, 0, -1], "bore", pin);
  port("B", [B.x, B.y, 3 * t + 0.4], [0, 0, 1], "bore", pin);
  port("C", [C.x, C.y, 3 * t + 0.4], [0, 0, 1], "bore", pin);
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
