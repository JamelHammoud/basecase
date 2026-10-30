export const build = {
  name: 'build',
  use: 'buildable robots: BOM, budget, printing and the checks that close the loop',
  text: `
When the user wants to build the robot (a printer, a budget, "buildable", "BOM"), the model is
a build package, not a picture.
1. Budget plan first: actuators ≤ 60%, compute ≤ 15%, power ~10% of the budget. set_build records
   the budget; size_actuators picks the actuators against it.
2. Every screw and insert is a hardware part (fasten places them): they're what the BOM counts.
3. Materials: petg or asa anywhere near a servo; tpu soles and bumpers; pla only for covers away
   from heat.
4. Print on the scene's printer (check_printability names it, with its bed and keep-out zones):
   a flat face for the bed, overhangs ≤ 45° or chamfered, structural walls ≥ 1.6 mm, layer lines
   not carrying the bending load. Split anything that doesn't fit, with a lap joint and screws.
5. Design for falls: replaceable, screwed covers and bumpers where it lands.
6. Close the loop: define_joints, then verify_design, check_assembly, check_printability,
   check_scene and get_bom (slice_plates for real times when there's a slicer). Fix every FAIL
   in the design and run them again.
The build is done when nothing FAILs, every part prints, check_assembly finds an order, and the
BOM is inside the budget. Report the verification table, print plan, build order and BOM
totals. Offer the build guide in one line ("Make a [build guide](#build-guide) to print the
assembly steps.") and make it only when asked.`,
};
