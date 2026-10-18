// Basecase: off-the-shelf part library for OpenSCAD (requires BOSL2).
// include <robotics.scad>   (it includes BOSL2/std.scad itself)
//
// Frame: Z up, millimeters. Servos are modeled with the ORIGIN ON THE OUTPUT SHAFT AXIS at the
// TOP FACE of the case; the case extends down (−Z) and along −X from the shaft.
// Dimensions are nominal datasheet values (± 0.3 mm). Verify critical fits before printing.

include <BOSL2/std.scad>

// ---------------------------------------------------------------- servo data
// [case length X, width Y, height Z], shaft offset from the case end (X), ear span (0 = none),
// ear thickness, ear top below the case top, spline diameter, spline height, ear hole pitch,
// and for dual-horn servos: horn face above the case top, idler-horn face below the case bottom,
// horn bolt circle, horn diameter
// Feetech STS3215 / STS3250 (Feetech STS3215 drawing, 2020-04-10): axis 12.5 mm from the case center; aluminium
// horns on both faces, Ø19.95 with 4 × M3 threaded holes on Ø14, faces 1.4 mm beyond the case (manufacturer mesh)
STS3215 = [[45.2, 24.7, 35.0], 10.1, 0,    0,   0,    5.9, 3.4, 0, 1.4, 1.4, 14, 19.95];
MG996R  = [[40.7, 19.7, 37.2], 10.2, 54.5, 2.5, 9.5,  5.9, 4.0, 49.5];// standard size servo
SG90    = [[22.5, 12.2, 22.7],  5.9, 32.2, 2.5, 4.5,  4.8, 3.2, 27.5];// 9 g micro servo
XL430   = [[46.5, 28.5, 34.0], 11.3, 0,    0,   0,    9.0, 1.5, 0];   // Dynamixel XL430 / XM430 (horn flange)
XL330   = [[34.0, 20.0, 26.0],  8.5, 0,    0,   0,    6.5, 1.5, 0];   // Dynamixel XL330

function servo_case(s)        = s[0];
function servo_shaft_offset(s)= s[1];
// Dual-horn servos: where the horn faces are and their bolt circle (others: older defaults)
function servo_dual(s)        = len(s) > 8;
function servo_horn_face(s)   = servo_dual(s) ? s[8] : 3.6;
function servo_idler_face(s)  = servo_dual(s) ? s[9] : 4.1;
function servo_horn_bc(s)     = servo_dual(s) ? s[10] : 14;
function servo_horn_d(s)      = servo_dual(s) ? s[11] : 20;

// Visual + fit model of a servo. Origin: output shaft axis, top of case.
module servo(s = STS3215) {
    sz = s[0]; off = s[1]; ears = s[2]; et = s[3]; edrop = s[4]; sd = s[5]; sh = s[6];
    // case (shaft end at x = +off)
    translate([off - sz.x/2, 0, -sz.z/2]) cuboid(sz, rounding = 1.2, edges = "Z");
    if (servo_dual(s)) {
        // output horn and idler horn, 4 × M3 on the bolt circle
        for (face = [[s[8], TOP, 2.5], [-sz.z - s[9], BOT, 2.1]])
            translate([0, 0, face[0]]) difference() {
                cyl(d = s[11], h = face[2], anchor = face[1], chamfer = 0.3);
                for (a = [0 : 90 : 270]) zrot(a) right(s[10] / 2) cyl(d = 2.5, h = 10);
            }
    } else {
        // gear-train dome around the shaft
        cyl(d = min(sz.y - 1.2, 14), h = 2.2, anchor = BOT, rounding2 = 0.6);
        // output spline
        up(2.2) cyl(d = sd, h = sh, anchor = BOT, chamfer2 = 0.4);
    }
    // mounting ears with screw holes
    if (ears > 0)
        translate([off - sz.x/2, 0, -edrop])
            difference() {
                cuboid([ears, sz.y, et], chamfer = 0.8, edges = "Z", anchor = TOP);
                for (sx = [-1, 1]) translate([sx * s[7]/2, 0, -et/2]) cyl(d = 2.2, h = et + 1);
            }
    // bus/feedback cable boot on the far end
    translate([off - sz.x + 0.5, 0, -sz.z + 6]) cuboid([3, 6, 4], rounding = 0.8, anchor = RIGHT);
}

// Cutter for a servo pocket with per-side print clearance; extend = how far it opens upward.
module servo_pocket(s = STS3215, clearance = 0.25, extend = 0) {
    sz = s[0]; off = s[1];
    translate([off - sz.x/2, 0, -sz.z/2 + extend/2])
        cuboid(sz + [2*clearance, 2*clearance, extend + 2*clearance], rounding = 1.2, edges = "Z");
    if (s[2] > 0)
        translate([off - sz.x/2, 0, -s[4] + 0.01])
            cuboid([s[2] + 2*clearance, sz.y + 2*clearance, s[3] + extend + 2*clearance], anchor = TOP + 0 * UP);
    // cable channel out of the far end
    translate([off - sz.x - 4, 0, -sz.z + 6]) cuboid([10, 7, 5], anchor = LEFT);
}

// ---------------------------------------------------------------- horns & hardware
// Round disk horn, origin at the shaft axis on the horn's bottom face.
module servo_horn_round(d = 20, t = 2.5, holes = 4, pitch = 14) {
    difference() {
        union() {
            cyl(d = d, h = t, anchor = BOT, rounding = 0.6);
            cyl(d = 7.5, h = t + 2.5, anchor = BOT, rounding2 = 0.5);
        }
        cyl(d = 2.4, h = 20);
        for (a = [0 : 360/holes : 359]) zrot(a) right(pitch/2) cyl(d = 1.8, h = 20);
    }
}

// Metric socket-head screw, origin under the head, shank down −Z.
module socket_screw(d = 3, l = 10) {
    cyl(d = d * 1.7, h = d, anchor = BOT, rounding2 = 0.3);
    cyl(d = d, h = l, anchor = TOP);
}

// Clearance hole cutter with counterbore (origin at the surface, drills down −Z).
module screw_clearance(d = 3, depth = 10, head = true) {
    cyl(d = d + 0.3, h = depth + 0.1, anchor = TOP);
    if (head) cyl(d = d * 1.7 + 0.6, h = d + 0.2, anchor = BOT);
}

// Hole for a brass heat-set insert, 1 mm deeper than the insert. Printed holes come out about
// 0.25 mm small, so these are the insert's nominal hole + ~0.15 mm (M2 3.35, M2.5 3.75, M3 4.15,
// M4 5.45). Leave ≥ 1.6 mm of wall around it (boss Ø = hole + 3.2).
module heatset_hole(m = 3, depth = 5) cyl(d = m == 2 ? 3.35 : m == 2.5 ? 3.75 : m == 4 ? 5.45 : 4.15, h = depth + 1.1, anchor = TOP);

// 608 skate bearing, centered, axis along Z.
module bearing_608() tube(od = 22, id = 8, h = 7);

// ---------------------------------------------------------------- larger actuators & mobility
// Pancake quasi-direct-drive actuator (humanoid / quadruped joints), axis along Z, centered.
// Output flange on the +Z face with a bolt circle. Typical sizes: QDD_S [60, 32], QDD_M [98, 40],
// QDD_L [120, 50] ([diameter, length] mm).
QDD_S = [60, 32];
QDD_M = [98, 40];
QDD_L = [120, 50];
module qdd_actuator(size = QDD_M, bolts = 8) {
    d = size[0]; h = size[1];
    cyl(d = d, h = h * 0.8, rounding = min(4, d * 0.05), anchor = TOP, $fn = 64);
    // back cover / encoder cap
    down(h * 0.8) cyl(d = d * 0.7, h = h * 0.2, rounding1 = 2, anchor = TOP, $fn = 48);
    // output flange with bolt circle
    difference() {
        cyl(d = d * 0.62, h = 3, chamfer2 = 0.8, anchor = BOT, $fn = 48);
        for (a = [0 : 360 / bolts : 359]) zrot(a) right(d * 0.24) cyl(d = max(2.5, d * 0.03), h = 8);
    }
}
// Cutter for a qdd pocket with clearance (open on +Z by `extend`).
module qdd_pocket(size = QDD_M, clearance = 0.4, extend = 0) {
    cyl(d = size[0] + 2 * clearance, h = size[1] + clearance + extend, anchor = TOP, $fn = 64);
}
// Wheel with tire and hub, axis along X, centered.
module wheel(d = 100, w = 30, hub = 30) {
    yrot(90) {
        tube(od = d, id = d * 0.72, h = w, $fn = 64);                         // tire
        cyl(d = d * 0.74, h = w * 0.6, rounding = 1, $fn = 48);               // rim
        cyl(d = hub, h = w + 4, chamfer = 1, $fn = 32);                       // hub
    }
}
// Swivel caster, origin at the top mounting plate center, wheel below.
module caster(d = 50) {
    cuboid([d * 0.9, d * 0.9, 3], rounding = 2, edges = "Z", anchor = TOP);
    down(3) cyl(d = d * 0.5, h = d * 0.25, anchor = TOP);
    down(3 + d * 0.25 + d / 2 - 2) yrot(90) cyl(d = d, h = d * 0.35, rounding = 2, $fn = 48);
}

// ---------------------------------------------------------------- mechanisms
// Servo U-bracket: the output link of a servo joint. Same frame as servo(): the output axis is
// Z through the origin, the case top is z = 0 and the body runs toward −X. One cheek bolts to the
// output horn, the other to the idler horn (dual-horn servos like the STS3215, so the link is held
// on both faces), and the web joins them on the +X side, clear of the case. reach = axis-to-web
// distance (≥ 18 for an STS3215 to clear the case corners through a full turn).
// Screws: 4 × M3 × 6 per cheek into the threaded horns (wall 3).
module servo_u_bracket(s = STS3215, wall = 3, reach = 28, horn = undef, idler = undef, clr = 0) {
  sz = servo_case(s);
  w = max(sz.y + 6, servo_horn_d(s) + 6);
  top = (is_undef(horn) ? servo_horn_face(s) : horn) + clr;      // underside of the horn cheek
  bot = -sz.z - (is_undef(idler) ? servo_idler_face(s) : idler) - clr; // top side of the idler cheek
  r = servo_horn_bc(s) / 2;
  module cheek_plate() hull() {
    cyl(d = w, h = wall, rounding = 1, anchor = BOT);
    right(reach) cuboid([wall, w, wall], rounding = 1, edges = "X", anchor = BOT);
  }
  // horn cheek: clearance for the M3 horn screw head, 4 × M3 counterbored into the horn
  up(top) difference() {
    cheek_plate();
    cyl(d = 6.5, h = 3 * wall);
    for (a = [0 : 90 : 270]) zrot(a) right(r) { cyl(d = 3.3, h = 3 * wall); up(wall - 1.8) cyl(d = 6, h = 3, anchor = BOT); }
  }
  // idler cheek: bolts to the idler horn
  up(bot - wall) difference() {
    cheek_plate();
    cyl(d = 6.5, h = 3 * wall);
    for (a = [0 : 90 : 270]) zrot(a) right(r) { cyl(d = 3.3, h = 3 * wall); down(0.01) cyl(d = 6, h = 1.8, anchor = BOT); }
  }
  // web with a lightening window and the next link's 4 × M3 pattern
  translate([reach, 0, bot - wall]) diff() cuboid([wall, w, top - bot + 2 * wall], rounding = 1, edges = "X", anchor = BOT + LEFT) {
    tag("remove") cuboid([3 * wall, w - 10, top - bot - 10], rounding = 3, edges = "X");
    tag("remove") for (y = [-w / 2 + 4, w / 2 - 4], z = [-(top - bot) / 2 + 2, (top - bot) / 2 - 2]) translate([0, y, z + wall]) xcyl(d = 3.2, h = 3 * wall);
  }
}

// Linear lift (column or torso lift): two rails, a carriage on four bearing blocks, a lead screw
// with a NEMA 17 at the bottom and end plates. Origin: base plate center, the stroke runs +Z.
// width = rail spacing; at = carriage height above its lowest position (0…stroke).
module linear_lift(stroke = 300, width = 70, at = 120, rail = 12) {
  len = stroke + 80;
  plate = [width + 30, 46, 6];
  cuboid(plate, rounding = 3, edges = "Z", anchor = BOT);                                   // base plate
  up(len - 6) cuboid(plate, rounding = 3, edges = "Z", anchor = BOT);                       // top plate
  for (x = [-width / 2, width / 2]) translate([x, 0, 6]) cyl(d = rail, h = len - 12, chamfer = 0.5, anchor = BOT, $fn = 32); // rails
  translate([0, 10, 6]) cyl(d = 8, h = len - 12, anchor = BOT, $fn = 24);                   // lead screw
  // NEMA 17 under the base plate driving the screw
  translate([0, 10, 0]) {
    cuboid([42.3, 42.3, 40], rounding = 3, edges = "Z", anchor = TOP);
    down(40) cyl(d = 22, h = 2, anchor = TOP);
  }
  // carriage: a plate with four linear bearings and a lead-screw nut
  up(30 + at) {
    diff() cuboid([width + 26, 10, 60], rounding = 2, anchor = CENTER) {
      tag("remove") for (x = [-width / 2 + 2, width / 2 - 2], z = [-20, 20]) translate([x + (x > 0 ? 9 : -9), 0, z]) ycyl(d = 3.4, h = 20);
    }
    for (x = [-width / 2, width / 2], z = [-18, 18]) translate([x, -9, z]) cuboid([rail + 12, 12, 22], rounding = 1.5, edges = "Y");
    translate([0, 10, 0]) cyl(d = 22, h = 14, chamfer = 0.8, $fn = 6);                       // nut block
  }
}
// Parallel gripper: a servo-driven rack-and-pinion with two fingers on a rail.
// Origin: mounting face center (bolts to the wrist), fingers point −Z. open = jaw gap.
module parallel_gripper(open = 50, finger = 55, body = [80, 34, 40]) {
  diff() cuboid(body, rounding = 4, edges = "Z", anchor = TOP) {
    tag("remove") position(TOP) for (x = [-12, 12], y = [-10, 10]) translate([x, y, 0.01]) cyl(d = 3.4, h = 8, anchor = TOP); // wrist bolts
    tag("remove") position(BOT) cuboid([body.x - 8, 10, 6], rounding = 2, edges = "Z", anchor = BOT); // finger rail slot
  }
  down(body.z) for (side = [-1, 1]) translate([side * (open / 2 + 6), 0, 0]) {
    cuboid([12, 22, 8], rounding = 1.5, edges = "Z", anchor = TOP);                           // finger carriage
    down(8) diff() prismoid([12, 20], [8, 16], h = finger, shift = [side * -1.5, 0], rounding = 2, anchor = TOP) {
      tag("remove") position(side > 0 ? LEFT : RIGHT) left(side * 0.01) cuboid([3, 16, finger - 8], anchor = side > 0 ? LEFT : RIGHT);
    }
    // TPU pad on the inner face
    color("#2b2b30") translate([-side * 4.5, 0, -8 - finger / 2 - 4]) cuboid([2.5, 15, finger - 14], rounding = 1, edges = "X");
  }
}

// ---------------------------------------------------------------- electronics
// Raspberry Pi 5 board, origin at board center, bottom face at z = 0.
module pi5() {
    color("green") cuboid([85, 56, 1.6], rounding = 3, edges = "Z", anchor = BOT);
    translate([85 / 2 - 9.5, 0, 1.6]) cuboid([17, 15, 13.5], anchor = BOT);  // USB/Ethernet block (simplified)
    up(1.6) cuboid([14, 14, 2.5], anchor = BOT);                            // SoC
}
// Raspberry Pi Zero 2 W board, origin at board center, bottom face at z = 0.
module pi_zero() {
    difference() {
        cuboid([65, 30, 1.4], rounding = 3, edges = "Z", anchor = BOT);
        for (x = [-29, 29], y = [-11.5, 11.5]) translate([x, y, 0]) cyl(d = 2.75, h = 5);
    }
    translate([-5, 0, 1.4]) cuboid([12, 12, 1.2], anchor = BOT);           // SoC
    translate([-29, 0, 1.4]) cuboid([5, 12, 1.4], anchor = BOT);            // micro SD
    translate([0, 11.5, 1.4]) cuboid([51, 5, 2.5], anchor = BOT);           // GPIO header pads
}

// 18650 Li-ion cell, axis along X, centered.
module cell_18650() xcyl(d = 18.4, h = 65.2, rounding = 1);

// Hole pattern helper: M2.5 on a w × h rectangle (e.g. Pi Zero 58 × 23).
module rect_holes(w, h, d = 2.7, depth = 10) for (x = [-w/2, w/2], y = [-h/2, h/2]) translate([x, y, 0]) cyl(d = d, h = depth);
