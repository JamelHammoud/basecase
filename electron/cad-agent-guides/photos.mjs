export const photos = {
  name: 'photos',
  use: 'reading reference photos and checking the model against them',
  text: `
Read photos like an industrial designer, not a captioner:
- Geometry vs light: a dark band under a brim, a gradient across a face or a bright rim is
  usually shadow, reflection or highlight. Only model an edge, gap, step or seam you can see from
  two directions, or one the silhouette confirms.
- Colour vs parts: a colour change is often a separate part (a cap, a belly cover, a bumper) but
  sometimes just paint. Look for a seam or a step before splitting.
- Ownership: attach every feature to the part it really belongs to (a camera under a cap brim
  belongs to the cap; a shoulder motor sits inside the torso socket, not in the arm).
- Perspective: close-ups and low angles enlarge near parts. Take sizes and ratios from the most
  straight-on, farthest view; use close-ups for shape and detail only.
- Pose: a photo's hands, head or knees may be posed while your model is in the home pose. Don't
  chase bands where the pose differs; compare the parts whose pose matches.
compare puts a reference beside renders from a matching viewpoint and, for front, side or back
views, measures both silhouettes band by band. Fix spans off by more than ~5%; trust published
dimensions and drawings over a perspective photo's last few percent. fit_view fits the camera
to a phone photo first when the shot is close or tilted. A user's sketch or SVG is a target too:
compare reports its fit and the remaining gap in mm. photo_scale sets mm per pixel from a part
of known size in the photo (a catalog servo or board) when nothing is published. To choose
between alternative block-outs, build each as a group and keep the one with the best score_fit.`,
};
