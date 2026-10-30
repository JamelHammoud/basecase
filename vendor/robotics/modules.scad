// Basecase proven modules: servo joints, battery bay, board tray. Included by robotics.scad.
// Each module reports its interfaces with PORT echoes (see recipes.scad) and holds its parts
// with real fasteners: M3 into heat-set inserts unless noted.

// ---------------------------------------------------------------- servo joint (STS3215 / STS3250)
// Frame: the servo() frame. Output axis = Z through the origin, case top at z = 0, the case runs
// toward -X. The STS3250 has the STS3215 outline (Feetech drawing), so pass STS3215 for both.
// The parent link holds the case in servo_cradle; the child link is servo_u_link, bolted to the
// output horn and the idler horn. The far end of the cradle (x <= -24) is where a link fuses on:
// it stays clear of the link's sweep, so the joint turns about +-110 degrees.

SERVO_CRADLE_CLEAR_X = -24;   // the cradle keeps its bridge and strap beyond this x

function _rcp_cradle_box(s, wall, clr) =
  let(sz = servo_case(s), off = servo_shaft_offset(s))
  [off - sz.x - clr - wall, off + clr + wall, sz.y / 2 + clr + wall];

// Servo cradle: a frame around the case with a bridge under the far end, two tabs that hold the
// horn end down, a cable slot, and a strap across the far end held by 2 x M3 into inserts.
// Drop the servo in horn end first (under the tabs), then fit the strap.
// part = "frame" | "strap" | "both".
module servo_cradle(s = STS3215, wall = 3, clr = 0.25, part = "frame", m = 3) {
  sz = servo_case(s);
  off = servo_shaft_offset(s);
  b = _rcp_cradle_box(s, wall, clr);
  x0 = b[0];
  x1 = b[1];
  hy = b[2];
  inner_y = sz.y / 2 + clr;
  bridge_x = SERVO_CRADLE_CLEAR_X;
  strap_x = (x0 + bridge_x) / 2;
  pad_y = hy + 2.2;
  if (part != "strap") {
    difference() {
      union() {
        translate([x0, -hy, -sz.z]) cube([x1 - x0, 2 * hy, sz.z]);
        translate([x0, -hy, -sz.z - wall]) cube([bridge_x - x0, 2 * hy, wall + 0.2]);
        for (sy = [-1, 1]) translate([off - 4, sy > 0 ? 10.6 : -hy, -0.2]) cube([x1 - off + 4, hy - 10.6, 1.1]);
        for (sy = [-1, 1]) translate([strap_x, sy * pad_y, 0]) cyl(d = insert_boss_d(m), h = 12, chamfer1 = 3, anchor = TOP);
      }
      translate([off - sz.x - clr, -inner_y, -sz.z - clr]) cube([sz.x + 2 * clr, 2 * inner_y, sz.z + clr + 0.1]);
      translate([x0 - 1, -5, -sz.z - wall - 1]) cube([wall + 2, 10, 14 + wall]);
      for (sy = [-1, 1]) placed([strap_x, sy * pad_y, 0]) { heatset_hole(m, insert_len(m)); port(sy > 0 ? "strap_boss_0" : "strap_boss_1", [0, 0, 0], [0, 0, 1], "boss", m); }
    }
    port("output", [0, 0, servo_horn_face(s)], [0, 0, 1], "output");
    port("horn", [0, 0, servo_horn_face(s)], [0, 0, 1], "hole_circle", servo_horn_bc(s));
    port("idler", [0, 0, -sz.z - servo_idler_face(s)], [0, 0, -1], "hole_circle", servo_horn_bc(s));
    port("mount", [x0, 0, -sz.z / 2], [-1, 0, 0], "face");
  }
  if (part != "frame") difference() {
    translate([strap_x - 5, -pad_y - 4, 0]) cuboid([10, 2 * pad_y + 8, wall], rounding = 1, edges = "Z", anchor = BOT + LEFT + FRONT);
    for (sy = [-1, 1]) translate([strap_x, sy * pad_y, 0]) cyl(d = screw_clear_d(m), h = 3 * wall);
    for (sy = [-1, 1]) placed([strap_x, sy * pad_y, wall]) port(sy > 0 ? "strap_screw_0" : "strap_screw_1", [0, 0, 0], [0, 0, 1], "screw", m);
  }
}

// Servo U-link: the child link of a servo joint. One cheek bolts to the output horn, the other
// to the idler horn (4 x M3 x 6 each into the threaded horns), joined by a web on +X at reach
// (>= 18 clears the case corners through a full turn). part = "link" (one piece) | "horn" |
// "idler": the split halves join under the web with 2 x M3 x 16 into inserts, so the link can be
// fitted after the servo is in a cradle that blocks a one-piece link from sliding on.
// mount = true adds 4 x M3 inserts on the web's outer face, 16 x 12 apart.
module servo_u_link(s = STS3215, wall = 3, reach = 28, web = 8, part = "link", mount = true, m = 3) {
  sz = servo_case(s);
  w = max(sz.y + 6, servo_horn_d(s) + 6);
  top = servo_horn_face(s);
  bot = -sz.z - servo_idler_face(s);
  zs = bot - wall + socket_head(m)[1] + 0.4 + 10;
  r = servo_horn_bc(s) / 2;
  split = part != "link";
  web_lo = split ? zs : bot - wall / 2;
  module cheek() hull() {
    cyl(d = w, h = wall, rounding = 1, anchor = BOT);
    right(reach) cuboid([web, w, wall], rounding = 1, edges = "X", anchor = BOT + LEFT);
  }
  module horn_holes(face) for (a = [0 : 90 : 270]) translate([r * cos(a), r * sin(a), face]) {
    cyl(d = screw_clear_d(m), h = 3 * wall);
    cyl(d = socket_head(m)[0] + 0.6, h = 2 * (wall - 1.2));
  }
  if (part != "idler") {
    difference() {
      union() {
        up(top) cheek();
        translate([reach, -w / 2, web_lo]) cube([web, w, top + wall - web_lo]);
        if (!split) up(bot - wall) cheek();
      }
      cyl(d = 6.5, h = 3 * (sz.z + 2 * wall) + 2);
      horn_holes(top + wall);
      if (!split) horn_holes(bot - wall);
      if (split) for (sy = [-1, 1]) placed([reach + web / 2, sy * (w / 2 - 5), zs], [180, 0, 0]) { heatset_hole(m, insert_len(m)); port(sy > 0 ? "web_boss_0" : "web_boss_1", [0, 0, 0], [0, 0, 1], "boss", m); }
      if (mount) for (k = [0 : 3]) placed([reach + web, (k % 2 ? 1 : -1) * 8, -8 + (k < 2 ? -6 : 6)], [0, 90, 0]) { heatset_hole(m, insert_len(m)); port(str("mount_", k), [0, 0, 0], [0, 0, 1], "boss", m); }
    }
    port("horn", [0, 0, top], [0, 0, -1], "hole_circle", servo_horn_bc(s));
    port("axis", [0, 0, top + wall], [0, 0, 1], "bore", 6.5);
    port("web", [reach + web, 0, -8], [1, 0, 0], "face");
    if (!split) port("idler", [0, 0, bot], [0, 0, 1], "hole_circle", servo_horn_bc(s));
  }
  if (part == "idler") {
    difference() {
      union() {
        up(bot - wall) cheek();
        translate([reach, -w / 2, bot - wall / 2]) cube([web, w, zs - bot + wall / 2]);
      }
      cyl(d = 6.5, h = 3 * (sz.z + wall) + 2, anchor = TOP);
      horn_holes(bot - wall);
      for (sy = [-1, 1]) placed([reach + web / 2, sy * (w / 2 - 5), bot - wall], [180, 0, 0]) counterbore_cut(m, zs - bot + wall + 1, name = sy > 0 ? "web_screw_0" : "web_screw_1");
    }
    port("idler", [0, 0, bot], [0, 0, 1], "hole_circle", servo_horn_bc(s));
  }
}

// Screw for the split U-link halves ([length, grip]): M3 x 16 into the web inserts.
function servo_u_link_screw(m = 3) = screw_for(10, m);

// ---------------------------------------------------------------- battery bay (outside the frame)
// A bay that hangs under a frame or torso by a flange (4 x M3 from below into the frame's inserts),
// with a hatch on its open bottom: a tongue slides into the end wall, one M3 into an insert holds the
// other end. Removing the battery takes the hatch screw and the hatch, and nothing structural.
// pack = the pack's nominal size, tol = its size tolerance (default: Ovonic 3S 2200 mAh,
// 105 x 33 x 21 +5/+2/+2). Origin: the mount face (top of the flange), the bay hangs down -Z.
// part = "bay" | "hatch" | "both".
PACK_3S_2200 = [105, 33, 21];
PACK_2S_2200 = [87, 33, 18];

function battery_bay_inner(pack = PACK_3S_2200, tol = [5, 2, 2], m = 3) =
  [pack.x + tol.x + 2 + insert_boss_d(m), pack.y + tol.y + 2, pack.z + tol.z + 2];

module battery_bay(pack = PACK_3S_2200, tol = [5, 2, 2], wall = 3, part = "bay", m = 3, flange = 9, hatch = 2.4) {
  inn = battery_bay_inner(pack, tol, m);
  out = [inn.x + 2 * wall, inn.y + 2 * wall, inn.z + wall + hatch];
  ty = inn.y / 2 - 3;
  rebate = wall / 2;
  bx = inn.x / 2 - insert_boss_d(m) / 2 + 0.6;
  bz = -out.z + hatch;
  mounts = [for (sx = [-1, 1], sy = [-1, 1]) [sx * (inn.x / 2 - 10), sy * (out.y / 2 + flange / 2)]];
  if (part != "hatch") {
    difference() {
      union() {
        translate([0, 0, -out.z]) cuboid(out, rounding = 3, edges = "Z", anchor = BOT);
        cuboid([inn.x + 2 * wall, out.y + 2 * flange, wall], rounding = 3, edges = "Z", anchor = TOP);
        translate([bx, 0, bz - 0.2]) cyl(d = insert_boss_d(m), h = inn.z * 0.6, anchor = BOT);
      }
      translate([0, 0, -out.z - 0.01]) cuboid([inn.x, inn.y, inn.z + hatch + 0.01], anchor = BOT);
      translate([0, 0, -out.z - 0.01]) cuboid([inn.x + 2 * rebate, inn.y + 2 * rebate, hatch + 0.01], anchor = BOT);
      translate([-inn.x / 2 - 2, -ty, -out.z + hatch - 0.01]) cube([2.01, 2 * ty, 2.4]);
      translate([inn.x / 2 - 22, 0, -wall - 0.1]) cuboid([14, 10, wall + 0.2], rounding = 2, edges = "Z", anchor = BOT);
      placed([bx, 0, bz], [180, 0, 0]) { heatset_hole(m, insert_len(m)); port("hatch_boss", [0, 0, 0], [0, 0, 1], "boss", m); }
      for (k = idx(mounts)) placed([mounts[k].x, mounts[k].y, -wall], [180, 0, 0]) {
        up(0.01) cyl(d = screw_clear_d(m), h = wall + 0.1, anchor = TOP);
        port(str("mount_", k), [0, 0, 0], [0, 0, 1], "screw", m);
      }
    }
    port("mount", [0, 0, 0], [0, 0, 1], "face");
    port("opening", [0, 0, -out.z], [0, 0, -1], "face");
    port("cable", [inn.x / 2 - 22, 0, 0], [0, 0, 1], "bore", 10);
  }
  if (part != "bay") {
    difference() {
      union() {
        translate([0, 0, -out.z]) cuboid([inn.x + 2 * rebate - 0.4, inn.y + 2 * rebate - 0.4, hatch], rounding = 1, edges = "Z", anchor = BOT);
        translate([-inn.x / 2, -ty + 0.3, -out.z + hatch - 0.2]) cube([3, 2 * ty - 0.6, 2.2]);
        translate([-inn.x / 2 - 1.8, -ty + 0.3, -out.z + hatch + 0.2]) cube([2, 2 * ty - 0.6, 1.8]);
        translate([0, 0, -out.z]) cuboid([inn.x * 0.5, 8, 1.2], rounding = 0.6, edges = "Z", anchor = TOP);
      }
      placed([bx, 0, -out.z], [180, 0, 0]) {
        up(0.01) cyl(d = screw_clear_d(m), h = hatch + 0.1, anchor = TOP);
        port("hatch_screw", [0, 0, 0], [0, 0, 1], "screw", m);
      }
    }
  }
}

// ---------------------------------------------------------------- board tray (Raspberry Pi 5)
// Raspberry Pi 5: PCB 85 x 56, 4 x M2.5 on 58 x 49, 3.5 mm from the left and bottom edges.
// Hole positions from the board center:
PI5_BOARD = [85, 56, 1.6];
PI5_HOLES = [[-39, -24.5], [19, -24.5], [-39, 24.5], [19, 24.5]];

// Tray for a Pi 5: a plate with standoffs on the board's real holes (M2.5 inserts), vent slots under
// the SoC, and 4 x M3 clearance holes at the ends (outside the board, so the tray comes out with the
// board on). Origin: the plate's bottom center; the board's center sits over the origin.
module pi5_tray(standoff = 6, plate = 2.5, margin = 4, ears = 10, m = 2.5, mount_m = 3) {
  size = [PI5_BOARD.x + 2 * margin + 2 * ears, PI5_BOARD.y + 2 * margin, plate];
  mounts = [for (sx = [-1, 1], sy = [-1, 1]) [sx * (size.x / 2 - ears / 2), sy * (size.y / 2 - 10)]];
  difference() {
    printed_block(size, r = 4, top = 0.6, bed = 0.4, $ports = false);
    placed([8, 0, plate]) vent_slots(n = 6, l = 30, w = 2.4, pitch = 5, depth = plate + 0.2);
    for (k = idx(mounts)) placed([mounts[k].x, mounts[k].y, plate]) {
      up(0.01) cyl(d = screw_clear_d(mount_m), h = plate + 0.1, anchor = TOP);
      port(str("mount_", k), [0, 0, 0], [0, 0, 1], "screw", mount_m);
    }
  }
  for (k = idx(PI5_HOLES)) placed([PI5_HOLES[k].x, PI5_HOLES[k].y, plate]) heatset_boss(m, standoff, flare = 1, name = str("hole_", k));
  port("board", [0, 0, plate + standoff], [0, 0, 1], "face");
}

// ---------------------------------------------------------------- servo link (joint to joint)
// A printed link between two servo joints: the U-link of the input joint (servo frame at the
// origin) fused by a beam to the cradle of the next joint, which sits length along +X, turned by
// twist degrees about X (0: parallel axes, e.g. elbow after shoulder; 90 or -90: the next axis
// along -Y or +Y). The beam stays beyond both joints' sweeps, so each turns +-110 degrees, and the
// input horn screws stay reachable from outside. length >= reach + web + 39.
// Ports: in_* (the U-link) and out_* (the cradle; out_output is the next joint's output).
module servo_link(length = 100, twist = 0, s = STS3215, wall = 3, reach = 28, web = 8) {
  sz = servo_case(s);
  b = _rcp_cradle_box(s, wall, 0.25);
  w = max(sz.y + 6, servo_horn_d(s) + 6);
  assert(length + b[0] >= reach + web + 0.5, str("servo_link: length must be at least ", reach + web + 0.5 - b[0]));
  placed(prefix = "in_") servo_u_link(s, wall, reach, web, part = "link", mount = false);
  placed([length, 0, 0], [twist, 0, 0], "out_") servo_cradle(s, wall, part = "frame");
  hull() {
    translate([reach + web - 0.4, -w / 2, -sz.z]) cube([0.4, w, sz.z]);
    translate([length, 0, 0]) rotate([twist, 0, 0]) translate([b[0], -b[2], -sz.z]) cube([0.4, 2 * b[2], sz.z]);
  }
}

// The base of a servo chain: the first joint's cradle on a pedestal under its far end, standing on
// a plate (4 x M3 counterbored into a table or a body) below the U-link's sweep.
module servo_base(s = STS3215, wall = 3, plate = [120, 90, 6]) {
  sz = servo_case(s);
  b = _rcp_cradle_box(s, wall, 0.25);
  floor_z = -sz.z - servo_idler_face(s) - wall - 2 - plate.z;
  placed(prefix = "") servo_cradle(s, wall, part = "frame");
  translate([b[0], -b[2], floor_z + plate.z - 0.2]) cube([SERVO_CRADLE_CLEAR_X - b[0], 2 * b[2], -sz.z - wall - floor_z - plate.z + 0.4]);
  difference() {
    translate([b[0] + plate.x / 2 - 6, 0, floor_z]) printed_block(plate, r = 6, $ports = false);
    for (sx = [-1, 1], sy = [-1, 1]) placed([b[0] + plate.x / 2 - 6 + sx * (plate.x / 2 - 8), sy * (plate.y / 2 - 8), floor_z + plate.z])
      counterbore_cut(3, plate.z + 1, name = str("base_screw_", (sx + 1) + (sy + 1) / 2));
  }
  port("floor", [0, 0, floor_z], [0, 0, -1], "face");
}
