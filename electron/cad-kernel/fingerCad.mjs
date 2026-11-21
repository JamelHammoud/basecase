export const DEFAULT_MOUNT = { height: 26, depth: 20, spacing: 12 };
export const DEFAULT_FINGER = { ...DEFAULT_MOUNT, length: 26, thickness: 4, clearance: 0.5, v: 0 };

const mountAssertions = `assert(mount_height >= mount_spacing + 12 && mount_spacing >= 10);
assert(mount_depth >= 16 && mount_depth <= 40 && mount_height <= 50);
`;

export const MOUNT_BODY = `${mountAssertions}gripper_finger_mount_m3(mount_height, mount_depth, mount_spacing);`;

export const FINGER_BODY = `${mountAssertions}assert(finger_length >= 12 && finger_length <= 100);
assert(finger_thickness >= 3.5 && finger_thickness <= 4.5);
assert(finger_clearance >= 0.1 && finger_clearance <= 4);
assert(finger_v == 0 || finger_v == 1);
difference() {
  union() {
    translate([-10-finger_thickness,-mount_depth/2,-mount_height]) cube([finger_thickness,mount_depth,mount_height+finger_thickness]);
    translate([-10-finger_thickness,-mount_depth/2,0]) cube([10+finger_thickness-finger_clearance,mount_depth,finger_thickness]);
    translate([-finger_thickness-finger_clearance,-mount_depth/2,finger_thickness]) cube([finger_thickness,mount_depth,finger_length]);
  }
  for (z = [-mount_height/2-mount_spacing/2,-mount_height/2+mount_spacing/2])
    translate([-11-finger_thickness,0,z]) rotate([0,90,0]) cylinder(d=3.4,h=finger_thickness+2,$fn=32);
  if (finger_v == 1)
    translate([-finger_clearance,0,finger_thickness-0.01]) linear_extrude(height=finger_length+0.02)
      polygon([[0,-1],[-1,0],[0,1],[1,1],[1,-1]]);
}`;

const mountHeader = (d) => `mount_height = ${d.height};\nmount_depth = ${d.depth};\nmount_spacing = ${d.spacing};\n`;

function finiteDimensions(values) {
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value)))
    throw new Error('Use finite numeric finger dimensions.');
}

export function mountCode(d) {
  finiteDimensions([d.height, d.depth, d.spacing]);

  return `include <robotics.scad>\n${mountHeader(d)}${MOUNT_BODY}`;
}

export function fingerCode(d) {
  finiteDimensions([d.height, d.depth, d.spacing, d.length, d.thickness, d.clearance, d.v]);

  return `${mountHeader(d)}finger_length = ${d.length};\nfinger_thickness = ${d.thickness};\nfinger_clearance = ${d.clearance};\nfinger_v = ${d.v};\n${FINGER_BODY}`;
}
