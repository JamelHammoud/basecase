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

// ---------------------------------------------------------------- cycloidal drive
// Printed cycloidal reducer around a BLDC motor, ring output: the housing bolts to the motor's
// stator face and holds both discs still through its posts, the eccentric input shaft rocks them,
// and the ring of output pins turns, so ratio = pins / (pins - lobes). Axis along +Z; z = 0 is the
// motor's stator face, the output face is on top. Two discs phased 180° balance each other.
// motor = [stator bolt circle, holes, screw M, shaft Ø, shaft length, first hole angle, rim height
// above the stator face] (a land inside the bolt circle clears a rim); bearings are [bore, OD, width]:
// cam_bearing in each disc on the eccentric, shaft_bearing in the cap hub on the motor shaft,
// out_bearing between the cap hub and the output. turn = input angle in degrees (poses the moving
// parts). part = "all" | "housing" | "cap" | "disc_a" | "disc_b" | "output" | "shaft".
function cycloid_profile(pins, lobes, R, r, e, steps) =
  let(n = pins, k = pins - lobes)
  [for (i = [0 : steps - 1])
    let(t = 360 * i / steps, psi = atan2(sin((k - n) * t), R / (e * n) - cos((k - n) * t)))
    [R * cos(t) - r * cos(t + psi) - e * cos(n * t), -R * sin(t) + r * sin(t + psi) + e * sin(n * t)]];

function cycloidal_post_r(R, e, pin_d, post_d, cam_bearing, clr = 0.15) =
  let(hole = post_d / 2 + e + clr, lo = cam_bearing[1] / 2 + 0.05 + 1.2 + hole,
      hi = R - e - pin_d / 2 - clr - 1.2 - hole)
  (lo + hi) / 2;

// z levels: [flange top, disc A, disc B, cap, out bearing, hub top, output plate, cavity top, output face]
function cycloidal_levels(t, out_bearing, rim = 0) =
  let(base_top = rim > 0 ? rim + 6.5 : 8, za = base_top + 1, zb = za + t + 1, cap = zb + t + 1.5, ob = cap + 6.3, hub = ob + out_bearing[2])
  [base_top, za, zb, cap, ob, hub, cap + 6.8, hub + 5.5, hub + 8.9];

module _cyc_disc(pins, lobes, R, pin_d, e, t, posts, post_d, post_r, cam_bearing, clr, phase = 0) {
  difference() {
    linear_extrude(t) rotate(phase) polygon(cycloid_profile(pins, lobes, R, pin_d / 2 + clr, e, 24 * pins));
    translate([0, 0, -0.01]) cylinder(d = cam_bearing[1] + 0.1, h = cam_bearing[2] + 0.21);
    translate([0, 0, -1]) cylinder(d = cam_bearing[1] - 3, h = t + 2);
    for (i = [0 : posts - 1]) rotate(360 * i / posts)
      translate([post_r, 0, -1]) cylinder(d = post_d + 2 * (e + clr), h = t + 2);
  }
}

module cycloidal_drive(pins = 15, lobes, R = 32, pin_d = 5, e = 1, t = 6, posts = 4, post_d = 8,
                       cam_bearing = [20, 27, 4], shaft_bearing = [10, 19, 5], out_bearing = [25, 37, 7],
                       motor = [44, 4, 4, 10, 30, 45, 0], clr = 0.15, turn = 0, part = "all") {
  L = is_undef(lobes) ? pins - 1 : lobes;
  z = cycloidal_levels(t, out_bearing, motor[6]);
  land = motor[6] > 0 ? motor[6] + 0.5 : 0;
  ring_r = R + 3;
  ear_r = ring_r + 5;
  post_r = cycloidal_post_r(R, e, pin_d, post_d, cam_bearing, clr);
  cap_r = min(post_r + post_d / 2 + 2, R - pin_d / 2 - 1);
  out_pcd = (out_bearing[1] / 2 + 1 + ring_r) / 2;
  spin = turn * (pins - L) / pins;
  assert(L < pins && e * pins < R, "cycloidal_drive: needs lobes < pins and e × pins < R");
  assert(z[3] + 0.5 + shaft_bearing[2] <= motor[4], "cycloidal_drive: the motor shaft is too short for this stack");
  all = part == "all";
  centre = function(phase) e * [cos(turn + phase), sin(turn + phase)];
  if (all || part == "housing") {
    difference() {
      union() {
        if (land > 0) cylinder(r = motor[0] / 2 + 1.5, h = land + 0.01);
        translate([0, 0, land]) cylinder(r = ring_r, h = z[0] - land);
        for (a = [0 : 90 : 270]) rotate(a) hull() {
          translate([ring_r - 4, 0, land]) cylinder(r = 4.5, h = z[0] - land);
          translate([ear_r, 0, land]) cylinder(r = 4.5, h = z[0] - land);
        }
        for (i = [0 : posts - 1]) rotate(360 * i / posts) translate([post_r, 0, land]) cylinder(d = post_d, h = z[3] - land);
      }
      translate([0, 0, -1]) cylinder(d = motor[3] + 6, h = z[0] + 2);
      for (a = [0 : 360 / motor[1] : 359]) rotate(a + motor[5]) translate([motor[0] / 2, 0, z[0]]) counterbore_cut(motor[2], depth = z[0], $ports = false);
      for (a = [0 : 90 : 270]) rotate(a) translate([ear_r, 0, -1]) cylinder(d = screw_clear_d(3), h = z[0] + 2);
      for (i = [0 : posts - 1]) rotate(360 * i / posts) translate([post_r, 0, z[3]]) heatset_hole(3, insert_len(3));
    }
    port("motor", [0, 0, 0], [0, 0, -1], "hole_circle", motor[0]);
    port("mount", [ear_r, 0, land], [0, 0, -1], "face");
    for (i = [0 : 3]) port(str("mount_", i), [ear_r * cos(90 * i), ear_r * sin(90 * i), land], [0, 0, -1], "screw", 3);
    for (i = [0 : motor[1] - 1]) let(a = motor[5] + 360 / motor[1] * i) port(str("motor_screw_", i), [motor[0] / 2 * cos(a), motor[0] / 2 * sin(a), z[0] - socket_head(motor[2])[1] - 0.4], [0, 0, 1], "screw", motor[2]);
    for (i = [0 : posts - 1]) let(a = 360 * i / posts) port(str("post_", i), [post_r * cos(a), post_r * sin(a), z[3]], [0, 0, 1], "screw", 3);
  }
  if (all || part == "disc_a") {
    translate([each centre(0), z[1]]) _cyc_disc(pins, L, R, pin_d, e, t, posts, post_d, post_r, cam_bearing, clr);
    port("bearing_a", [each centre(0), z[1]], [0, 0, -1], "bore", cam_bearing[1]);
  }
  if (all || part == "disc_b") {
    translate([each centre(180), z[2]]) _cyc_disc(pins, L, R, pin_d, e, t, posts, post_d, post_r, cam_bearing, clr, 180 / L);
    port("bearing_b", [each centre(180), z[2]], [0, 0, -1], "bore", cam_bearing[1]);
  }
  if (all || part == "shaft") {
    rotate(turn) difference() {
      union() {
        translate([0, 0, z[0] + 0.3]) cylinder(d = motor[3] + 6, h = z[3] - z[0] - 1.3);
        translate([e, 0, z[1]]) cylinder(d = cam_bearing[0] - 0.1, h = t);
        translate([-e, 0, z[2]]) cylinder(d = cam_bearing[0] - 0.1, h = t);
      }
      translate([0, 0, z[0]]) cylinder(d = motor[3] + 0.1, h = z[3]);
    }
    port("motor_shaft", [0, 0, z[0] + 0.3], [0, 0, -1], "bore", motor[3]);
  }
  if (all || part == "cap") {
    difference() {
      union() {
        translate([0, 0, z[3]]) cylinder(r = cap_r, h = 6);
        translate([0, 0, z[3]]) cylinder(d = out_bearing[0] - 0.1, h = z[5] - z[3]);
      }
      translate([0, 0, z[3] - 0.01]) cylinder(d = shaft_bearing[1] + 0.1, h = shaft_bearing[2] + 0.51);
      translate([0, 0, z[3]]) cylinder(d = motor[3] + 1, h = motor[4] - z[3] + 0.5);
      for (i = [0 : posts - 1]) rotate(360 * i / posts) translate([post_r, 0, z[3] + 6]) counterbore_cut(3, depth = 6, $ports = false);
    }
    port("shaft_bearing", [0, 0, z[3]], [0, 0, -1], "bore", shaft_bearing[1]);
    port("out_bearing", [0, 0, z[4]], [0, 0, 1], "boss", out_bearing[0]);
    port("encoder", [0, 0, z[5]], [0, 0, 1], "face");
    for (i = [0 : posts - 1]) let(a = 360 * i / posts) port(str("cap_screw_", i), [post_r * cos(a), post_r * sin(a), z[3] + 6 - socket_head(3)[1] - 0.4], [0, 0, 1], "screw", 3);
  }
  if (all || part == "output") {
    rotate(spin) difference() {
      union() {
        translate([0, 0, z[0] + 0.4]) difference() {
          cylinder(r = ring_r, h = z[6] - z[0] - 0.4);
          translate([0, 0, -1]) cylinder(r = R, h = z[6] - z[0] + 2);
        }
        translate([0, 0, z[6]]) cylinder(r = ring_r, h = z[8] - z[6]);
        for (i = [0 : pins - 1]) rotate(360 * i / pins) translate([R, 0, z[0] + 0.6]) cylinder(d = pin_d, h = z[6] - z[0] - 0.59);
      }
      translate([0, 0, z[6] - 0.01]) cylinder(d = out_bearing[1] + 0.1, h = z[5] - z[6] + 0.01);
      translate([0, 0, z[5] - 0.01]) cylinder(r = 16, h = z[7] - z[5] + 0.01);
      translate([0, 0, z[7] - 0.01]) cylinder(d = 6.2, h = 2.61);
      for (i = [0 : 5]) rotate(60 * i) translate([out_pcd, 0, z[8]]) heatset_hole(3, insert_len(3));
    }
    port("output", [0, 0, z[8]], [0, 0, 1], "output", 2 * out_pcd);
    port("bearing", [0, 0, z[6]], [0, 0, -1], "bore", out_bearing[1]);
    port("magnet", [0, 0, z[7]], [0, 0, -1], "bore", 6);
    for (i = [0 : 5]) let(a = 60 * i + spin) port(str("out_", i), [out_pcd * cos(a), out_pcd * sin(a), z[8]], [0, 0, 1], "screw", 3);
  }
}
