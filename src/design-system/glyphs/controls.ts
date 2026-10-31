import { glyph } from '../glyph';

export const PlusIcon = glyph({ d: 'M4 12H20M12 4V20', weight: 2.5 });

export const MinusIcon = glyph('M4 12H20');

export const CloseIcon = glyph({ d: 'M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5', weight: 2.5 });

export const TickIcon = glyph('M4.5 12.5L9.5 17.5L19.5 6.5');

export const ChevronDownIcon = glyph({ d: 'M6 9L12 15L18 9', weight: 2.5 });

export const ChevronUpIcon = glyph({ d: 'M6 15L12 9L18 15', weight: 2.5 });

export const ChevronLeftIcon = glyph({ d: 'M15 6L9 12L15 18', weight: 2.5 });

export const ChevronRightIcon = glyph({ d: 'M9 6L15 12L9 18', weight: 2.5 });

export const ArrowUpIcon = glyph('M12 20V4M5.5 10.5L12 4L18.5 10.5');

export const ArrowDownIcon = glyph('M12 4V20M5.5 13.5L12 20L18.5 13.5');

export const ArrowUpRightIcon = glyph('M6.1 17.9L17.1 6.9M7.6 6.9H17.1V16.4');

export const FloorIcon = glyph('M12 3V15M6.5 9.5L12 15L17.5 9.5M4 20.5H20');

export const DownloadIcon = glyph(
  'M12 3V14M7 9L12 14L17 9M4 15.5V18A2.5 2.5 0 0 0 6.5 20.5H17.5A2.5 2.5 0 0 0 20 18V15.5',
);

export const ShareIcon = glyph(
  'M8.5 9.5H7A2.5 2.5 0 0 0 4.5 12V18.5A2.5 2.5 0 0 0 7 21H17A2.5 2.5 0 0 0 19.5 18.5V12A2.5 2.5 0 0 0 17 9.5H15.5M12 2.75V14.5M8 6.75L12 2.75L16 6.75',
);

export const SwapIcon = glyph('M4 7.5H19.5M16 4L19.5 7.5L16 11M20 16.5H4.5M8 13L4.5 16.5L8 20');

export const ReturnIcon = glyph('M19.5 4.5V11A3.5 3.5 0 0 1 16 14.5H4.5M9 10L4.5 14.5L9 19');

export const UndoIcon = glyph('M8.5 13.5L4 9L8.5 4.5M4 9H14.5A5.75 5.75 0 0 1 14.5 20.5H11');

export const RedoIcon = glyph('M15.5 13.5L20 9L15.5 4.5M20 9H9.5A5.75 5.75 0 0 0 9.5 20.5H13');

export const RotateLeftIcon = glyph('M6.52 7.77A7.75 7.75 0 1 0 12 5.5L9.75 5.5M12.4 8.15L9.75 5.5L12.4 2.85');

export const RotateRightIcon = glyph('M17.48 7.77A7.75 7.75 0 1 1 12 5.5L14.25 5.5M11.6 2.85L14.25 5.5L11.6 8.15');

export const RefreshIcon = glyph(
  'M4.01 14.91A8.5 8.5 0 0 1 17.69 5.68L18.06 6.02M17.88 2.52L18.06 6.02L14.56 6.2M19.99 9.09A8.5 8.5 0 0 1 6.31 18.32L5.94 17.98M6.12 21.48L5.94 17.98L9.44 17.8',
);

export const HistoryIcon = glyph(
  'M3.25 12A8.75 8.75 0 1 0 5.81 5.81L4.4 7.23M8.15 7.23L4.4 7.23L4.4 3.48M12 7.5V12L15 13.75',
);

export const SpinnerIcon = glyph('M20.5 12A8.5 8.5 0 1 1 14.63 3.92');

export const CircleIcon = glyph('M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0');

export const CircleDotIcon = glyph({
  d: 'M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0',
  dots: 'M12 12h0',
  dotSize: 5,
});

export const CircleCheckIcon = glyph('M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0M8 12.25L10.75 15L16 9.25');

export const CircleMinusIcon = glyph('M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0M8 12H16');

export const CircleCloseIcon = glyph('M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0M9 9L15 15M15 9L9 15');

export const AlertIcon = glyph({
  d: 'M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0M12 7.25V12.25',
  dots: 'M12 16.25h0',
  dotSize: 2.75,
});

export const WarningIcon = glyph({
  d: 'M10.87 4.2Q12 2.25 13.13 4.2L21.12 18.05Q22.25 20 20 20L4 20Q1.75 20 2.88 18.05ZM12 8.5V12.5',
  dots: 'M12 16.25h0',
  dotSize: 2.75,
});

export const VerifiedIcon = glyph(
  'M10.76 3.01Q12 2 13.24 3.01L13.86 3.51Q15.1 4.52 16.69 4.68L17.48 4.76Q19.07 4.93 19.24 6.52L19.32 7.31Q19.48 8.9 20.49 10.14L20.99 10.76Q22 12 20.99 13.24L20.49 13.86Q19.48 15.1 19.32 16.69L19.24 17.48Q19.07 19.07 17.48 19.24L16.69 19.32Q15.1 19.48 13.86 20.49L13.24 20.99Q12 22 10.76 20.99L10.14 20.49Q8.9 19.48 7.31 19.32L6.52 19.24Q4.93 19.07 4.76 17.48L4.68 16.69Q4.52 15.1 3.51 13.86L3.01 13.24Q2 12 3.01 10.76L3.51 10.14Q4.52 8.9 4.68 7.31L4.76 6.52Q4.93 4.93 6.52 4.76L7.31 4.68Q8.9 4.52 10.14 3.51ZM8.25 12.25L10.75 14.75L15.75 9.5',
);

export const MenuIcon = glyph('M4 6.5H20M4 12H20M4 17.5H20');

export const MoreIcon = glyph({ d: '', dots: 'M5.5 12h0M12 12h0M18.5 12h0', dotSize: 3.5 });

export const PauseIcon = glyph(
  'M6.5 4H8.5A1.5 1.5 0 0 1 10 5.5V18.5A1.5 1.5 0 0 1 8.5 20H6.5A1.5 1.5 0 0 1 5 18.5V5.5A1.5 1.5 0 0 1 6.5 4ZM15.5 4H17.5A1.5 1.5 0 0 1 19 5.5V18.5A1.5 1.5 0 0 1 17.5 20H15.5A1.5 1.5 0 0 1 14 18.5V5.5A1.5 1.5 0 0 1 15.5 4Z',
);

export const StopIcon = glyph(
  'M7.5 5H16.5A2.5 2.5 0 0 1 19 7.5V16.5A2.5 2.5 0 0 1 16.5 19H7.5A2.5 2.5 0 0 1 5 16.5V7.5A2.5 2.5 0 0 1 7.5 5Z',
);

export const StopSolidIcon = glyph({
  d: 'M7.5 5H16.5A2.5 2.5 0 0 1 19 7.5V16.5A2.5 2.5 0 0 1 16.5 19H7.5A2.5 2.5 0 0 1 5 16.5V7.5A2.5 2.5 0 0 1 7.5 5Z',
  fill: true,
});

export const FitIcon = glyph(
  'M3 8.5V5.5A2.5 2.5 0 0 1 5.5 3H8.5M15.5 3H18.5A2.5 2.5 0 0 1 21 5.5V8.5M21 15.5V18.5A2.5 2.5 0 0 1 18.5 21H15.5M8.5 21H5.5A2.5 2.5 0 0 1 3 18.5V15.5',
);

export const ExpandIcon = glyph('M14.5 3.5H20.5V9.5M20.5 3.5L14 10M9.5 20.5H3.5V14.5M3.5 20.5L10 14');

export const ExternalLinkIcon = glyph(
  'M10 3.5H6A2.5 2.5 0 0 0 3.5 6V18A2.5 2.5 0 0 0 6 20.5H18A2.5 2.5 0 0 0 20.5 18V14M14 3.5H20.5V10M20.5 3.5L11 13',
);

export const PanelLeftIcon = glyph(
  'M5 3.5H19A2.5 2.5 0 0 1 21.5 6V18A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6A2.5 2.5 0 0 1 5 3.5ZM7.75 8V16',
);

export const PanelRightIcon = glyph(
  'M5 3.5H19A2.5 2.5 0 0 1 21.5 6V18A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6A2.5 2.5 0 0 1 5 3.5ZM16.25 8V16',
);

export const PanelsIcon = glyph(
  'M5 3.5H19A2.5 2.5 0 0 1 21.5 6V18A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6A2.5 2.5 0 0 1 5 3.5ZM7.75 8V16M16.25 8V16',
);
