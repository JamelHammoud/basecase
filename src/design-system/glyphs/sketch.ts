import { glyph } from '../glyph';

export const RectangleIcon = glyph(
  'M5 5H19A2.5 2.5 0 0 1 21.5 7.5V16.5A2.5 2.5 0 0 1 19 19H5A2.5 2.5 0 0 1 2.5 16.5V7.5A2.5 2.5 0 0 1 5 5Z',
);

export const ArcIcon = glyph({
  d: 'M3.25 15.5A8.75 8.75 0 0 1 20.75 15.5',
  dots: 'M3.25 15.5h0M20.75 15.5h0',
  dotSize: 4.5,
});

export const HorizontalIcon = glyph({ d: 'M4.25 12H19.75', dots: 'M4.25 12h0M19.75 12h0', dotSize: 4.5 });

export const VerticalIcon = glyph({ d: 'M12 4.25V19.75', dots: 'M12 4.25h0M12 19.75h0', dotSize: 4.5 });

export const ParallelIcon = glyph('M4 20.5L13 3.5M11 20.5L20 3.5');

export const PerpendicularIcon = glyph('M3.5 19.5H20.5M12 19.5V4.5');

export const EqualIcon = glyph('M4.5 8.5H19.5M4.5 15.5H19.5');

export const TangentIcon = glyph('M5.25 12.25a6.75 6.75 0 1 0 13.5 0a6.75 6.75 0 1 0 -13.5 0M2.5 19H21.5');

export const CoincidentIcon = glyph({
  d: 'M5.25 12a6.75 6.75 0 1 0 13.5 0a6.75 6.75 0 1 0 -13.5 0',
  dots: 'M12 12h0',
  dotSize: 5,
});
