import { rr, circle } from './draw.mjs';

const ENDS = 4.5;

export const SKETCH = {
  RectangleIcon: rr([2.5, 5, 19, 14], 2.5),
  ArcIcon: { d: 'M3.25 15.5A8.75 8.75 0 0 1 20.75 15.5', dots: 'M3.25 15.5h0M20.75 15.5h0', dotSize: ENDS },
  HorizontalIcon: { d: 'M4.25 12H19.75', dots: 'M4.25 12h0M19.75 12h0', dotSize: ENDS },
  VerticalIcon: { d: 'M12 4.25V19.75', dots: 'M12 4.25h0M12 19.75h0', dotSize: ENDS },
  ParallelIcon: 'M4 20.5L13 3.5M11 20.5L20 3.5',
  PerpendicularIcon: 'M3.5 19.5H20.5M12 19.5V4.5',
  EqualIcon: 'M4.5 8.5H19.5M4.5 15.5H19.5',
  TangentIcon: circle(12, 12.25, 6.75) + 'M2.5 19H21.5',
  CoincidentIcon: { d: circle(12, 12, 6.75), dots: 'M12 12h0', dotSize: 5 },
};
