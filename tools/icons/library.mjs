import { nudge, pt, rr, circle, ellipse, rounded, loopArrow, polar } from './draw.mjs';
import {
  pencil,
  gear,
  badge,
  capsule,
  eraser,
  marker,
  pen,
  eyedropper,
  brush,
  scissors,
  sparkle,
} from './drawings.mjs';

const PHOTO_FRAME = rr([2.5, 3.5, 19, 17], 2.5);
const PHOTO_RIDGE = 'M2.5 15L8 9.5L13.5 15L16 12.5L21.5 16';
const EYE = 'M2.25 12C4.5 7.25 8 5 12 5S19.5 7.25 21.75 12C19.5 16.75 16 19 12 19S4.5 16.75 2.25 12Z';
const PUPIL = circle(12, 12, 3.25);
const PAGE = rr([4.5, 2.5, 15, 19], 2.5);
const FOLDER = rounded(
  [
    [2.5, 4.5],
    [9, 4.5],
    [11, 7],
    [21.5, 7],
    [21.5, 19.5],
    [2.5, 19.5],
  ],
  [2.5, 1, 1, 2.5, 2.5, 2.5],
);
const BOOKMARK =
  'M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5v14.7a.8.8 0 0 1-1.25.66L12 17.5l-4.75 3.36A.8.8 0 0 1 6 20.2z';
const CLIPBOARD = rounded(
  [
    [4.5, 4.5],
    [8.5, 4.5],
    [8.5, 2.5],
    [15.5, 2.5],
    [15.5, 4.5],
    [19.5, 4.5],
    [19.5, 21.5],
    [4.5, 21.5],
  ],
  [2.5, 1, 1, 1, 1, 2.5, 2.5, 2.5],
);
const COPY_BACK = 'M5 15.5A2.5 2.5 0 0 1 2.5 13V5A2.5 2.5 0 0 1 5 2.5H13A2.5 2.5 0 0 1 15.5 5';
const COPY_FRONT = rr([8.5, 8.5, 13, 13], 2.5);
const PANEL = rr([2.5, 3.5, 19, 17], 2.5);
const RING = circle(12, 12, 9.5);

const union = rounded(
  [
    [3, 3],
    [15, 3],
    [15, 9],
    [21, 9],
    [21, 21],
    [9, 21],
    [9, 15],
    [3, 15],
  ],
  [2.5, 2.5, 1.5, 2.5, 2.5, 2.5, 1.5, 2.5],
);

const alignX = (x, bars) => `M${x} 2.5V21.5` + bars.map(([x0, x1, y]) => rr([x0, y, x1 - x0, 5], 1.5)).join('');
const alignY = (y, bars) => `M2.5 ${y}H21.5` + bars.map(([y0, y1, x]) => rr([x, y0, 5, y1 - y0], 1.5)).join('');

const LIGHT_CONTROL = 2.5;

const DRAWN = {
  controls: {
    PlusIcon: { d: 'M4 12H20M12 4V20', weight: LIGHT_CONTROL },
    MinusIcon: 'M4 12H20',
    CloseIcon: { d: 'M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5', weight: LIGHT_CONTROL },
    TickIcon: 'M4.5 12.5L9.5 17.5L19.5 6.5',
    ChevronDownIcon: { d: 'M6 9L12 15L18 9', weight: LIGHT_CONTROL },
    ChevronUpIcon: { d: 'M6 15L12 9L18 15', weight: LIGHT_CONTROL },
    ChevronLeftIcon: { d: 'M15 6L9 12L15 18', weight: LIGHT_CONTROL },
    ChevronRightIcon: { d: 'M9 6L15 12L9 18', weight: LIGHT_CONTROL },
    ArrowUpIcon: 'M12 20V4M5.5 10.5L12 4L18.5 10.5',
    ArrowDownIcon: 'M12 4V20M5.5 13.5L12 20L18.5 13.5',
    ArrowUpRightIcon: 'M6.5 17.5L17.5 6.5M8 6.5H17.5V16',
    FloorIcon: 'M12 3V15M6.5 9.5L12 15L17.5 9.5M4 20.5H20',
    DownloadIcon: 'M12 3V14M7 9L12 14L17 9M4 15.5V18A2.5 2.5 0 0 0 6.5 20.5H17.5A2.5 2.5 0 0 0 20 18V15.5',
    ShareIcon:
      'M8.5 9.5H7A2.5 2.5 0 0 0 4.5 12V18.5A2.5 2.5 0 0 0 7 21H17A2.5 2.5 0 0 0 19.5 18.5V12A2.5 2.5 0 0 0 17 9.5H15.5M12 2.75V14.5M8 6.75L12 2.75L16 6.75',
    SwapIcon: 'M4 7.5H19.5M16 4L19.5 7.5L16 11M20 16.5H4.5M8 13L4.5 16.5L8 20',
    ReturnIcon: 'M19.5 4.5V11A3.5 3.5 0 0 1 16 14.5H4.5M9 10L4.5 14.5L9 19',
    UndoIcon: 'M8.5 13.5L4 9L8.5 4.5M4 9H14.5A5.75 5.75 0 0 1 14.5 20.5H11',
    RedoIcon: 'M15.5 13.5L20 9L15.5 4.5M20 9H9.5A5.75 5.75 0 0 0 9.5 20.5H13',
    RotateLeftIcon: loopArrow({ c: [12, 13.25], r: 7.75, from: 225, to: -90, cw: false }),
    RotateRightIcon: loopArrow({ c: [12, 13.25], r: 7.75, from: -45, to: 270 }),
    RefreshIcon:
      loopArrow({ c: [12, 12], r: 8.5, from: 160, to: 312, tail: 0.5, arm: 3.5 }) +
      loopArrow({ c: [12, 12], r: 8.5, from: -20, to: 132, tail: 0.5, arm: 3.5 }),
    HistoryIcon: loopArrow({ c: [12, 12], r: 8.75, from: 180, to: -135, cw: false, tail: 2 }) + 'M12 7.5V12L15 13.75',
    SpinnerIcon: 'M20.5 12A8.5 8.5 0 1 1 14.63 3.92',
    CircleIcon: circle(12, 12, 9),
    CircleDotIcon: { d: circle(12, 12, 9.5), dots: 'M12 12h0', dotSize: 5 },
    CircleCheckIcon: RING + 'M8 12.25L10.75 15L16 9.25',
    CircleMinusIcon: RING + 'M8 12H16',
    CircleCloseIcon: RING + 'M9 9L15 15M15 9L9 15',
    AlertIcon: { d: RING + 'M12 7.25V12.25', dots: 'M12 16.25h0', dotSize: 2.75 },
    WarningIcon: {
      d:
        rounded(
          [
            [12, 2.75],
            [22.25, 20.5],
            [1.75, 20.5],
          ],
          2.25,
        ) + 'M12 9V13',
      dots: 'M12 16.75h0',
      dotSize: 2.75,
    },
    VerifiedIcon: badge() + 'M8.25 12.25L10.75 14.75L15.75 9.5',
    MenuIcon: 'M4 6.5H20M4 12H20M4 17.5H20',
    MoreIcon: { d: '', dots: 'M5.5 12h0M12 12h0M18.5 12h0', dotSize: 3.5 },
    PauseIcon: rr([5, 4, 5, 16], 1.5) + rr([14, 4, 5, 16], 1.5),
    StopIcon: rr([5, 5, 14, 14], 2.5),
    StopSolidIcon: { d: rr([5, 5, 14, 14], 2.5), fill: true },
    FitIcon:
      'M3 8.5V5.5A2.5 2.5 0 0 1 5.5 3H8.5M15.5 3H18.5A2.5 2.5 0 0 1 21 5.5V8.5M21 15.5V18.5A2.5 2.5 0 0 1 18.5 21H15.5M8.5 21H5.5A2.5 2.5 0 0 1 3 18.5V15.5',
    ExpandIcon: 'M14.5 3.5H20.5V9.5M20.5 3.5L14 10M9.5 20.5H3.5V14.5M3.5 20.5L10 14',
    ExternalLinkIcon:
      'M10 3.5H6A2.5 2.5 0 0 0 3.5 6V18A2.5 2.5 0 0 0 6 20.5H18A2.5 2.5 0 0 0 20.5 18V14M14 3.5H20.5V10M20.5 3.5L11 13',
    PanelLeftIcon: PANEL + 'M7.75 8V16',
    PanelRightIcon: PANEL + 'M16.25 8V16',
    PanelsIcon: PANEL + 'M7.75 8V16M16.25 8V16',
  },
  editing: {
    ComposeIcon:
      'M11 3H6A3 3 0 0 0 3 6V18A3 3 0 0 0 6 21H18A3 3 0 0 0 21 18V13' +
      pencil({ tip: [8.75, 15.25], len: 14, w: 2.5, cone: 3.75 }),
    CopyIcon: COPY_BACK + COPY_FRONT,
    DuplicateIcon: COPY_BACK + COPY_FRONT + 'M15 12.5V17.5M12.5 15H17.5',
    ClipboardIcon: CLIPBOARD + 'M8.5 11H15.5M8.5 15.5H13',
    PasteIcon:
      rounded(
        [
          [4, 4.75],
          [8, 4.75],
          [8, 2.25],
          [16, 2.25],
          [16, 4.75],
          [20, 4.75],
          [20, 21.75],
          [4, 21.75],
        ],
        [2.5, 1.25, 1.25, 1.25, 1.25, 2.5, 2.5, 2.5],
      ) + 'M12 8.5V17.5M8.25 13.75L12 17.5L15.75 13.75',
    CutIcon: scissors(),
    HiddenIcon: { d: EYE + PUPIL, cut: 'M3.5 3.5L20.5 20.5', cutWidth: 5.5, over: 'M3.5 3.5L20.5 20.5' },
    LockIcon: rr([4, 10.5, 16, 11], 2.5) + 'M7.5 10.5V7.5A4.5 4.5 0 0 1 16.5 7.5V10.5',
    UnlockIcon: rr([4, 10.5, 16, 11], 2.5) + `M7.5 10.5V7.5A4.5 4.5 0 0 1 ${pt(polar([12, 7.5], 4.5, -25))}`,
    GroupIcon:
      'M2.5 6.5V5A2.5 2.5 0 0 1 5 2.5H6.5M17.5 2.5H19A2.5 2.5 0 0 1 21.5 5V6.5M21.5 17.5V19A2.5 2.5 0 0 1 19 21.5H17.5M6.5 21.5H5A2.5 2.5 0 0 1 2.5 19V17.5' +
      rr([6, 6, 6, 6], 1.5) +
      rr([12, 12, 6, 6], 1.5),
    UngroupIcon: rr([2.5, 2.5, 9, 9], 2) + rr([12.5, 12.5, 9, 9], 2),
    UnionIcon: union,
    SubtractIcon: {
      d: rounded(
        [
          [3, 3],
          [15, 3],
          [15, 9],
          [9, 9],
          [9, 15],
          [3, 15],
        ],
        [2.5, 2.5, 1, 1, 1, 2.5],
      ),
      dash: 'M17.5 9H18.5A2.5 2.5 0 0 1 21 11.5V18.5A2.5 2.5 0 0 1 18.5 21H11.5A2.5 2.5 0 0 1 9 18.5V17.5',
    },
    IntersectIcon: {
      d: rr([9, 9, 6, 6], 1),
      dash: 'M15 6.5V5.5A2.5 2.5 0 0 0 12.5 3H5.5A2.5 2.5 0 0 0 3 5.5V12.5A2.5 2.5 0 0 0 5.5 15H6.5M17.5 9H18.5A2.5 2.5 0 0 1 21 11.5V18.5A2.5 2.5 0 0 1 18.5 21H11.5A2.5 2.5 0 0 1 9 18.5V17.5',
    },
    AlignLeftIcon: alignX(3.5, [
      [7, 20.5, 5],
      [7, 15, 14],
    ]),
    AlignCenterXIcon: alignX(12, [
      [4.5, 19.5, 5],
      [7, 17, 14],
    ]),
    AlignRightIcon: alignX(20.5, [
      [3.5, 17, 5],
      [9, 17, 14],
    ]),
    AlignTopIcon: alignY(3.5, [
      [7, 20.5, 5],
      [7, 15, 14],
    ]),
    AlignCenterYIcon: alignY(12, [
      [4.5, 19.5, 5],
      [7, 17, 14],
    ]),
    AlignBottomIcon: alignY(20.5, [
      [3.5, 17, 5],
      [9, 17, 14],
    ]),
    SpreadXIcon: 'M3 2.5V21.5M21 2.5V21.5' + rr([9, 6, 6, 12], 1.5),
    SpreadYIcon: 'M2.5 3H21.5M2.5 21H21.5' + rr([6, 9, 12, 6], 1.5),
  },
  files: {
    SpreadsheetIcon: PAGE + 'M4.5 10H19.5M4.5 15.75H19.5M12 10V21.5',
    FileImportIcon: rr([3, 3, 18, 18], 3) + 'M12 7.25V16.5M8 12.5L12 16.5L16 12.5',
    FolderIcon: FOLDER,
    FolderOpenIcon:
      rounded(
        [
          [2.5, 19.5],
          [2.5, 4.5],
          [9, 4.5],
          [11, 7],
          [18, 7],
          [18, 10.5],
        ],
        [0, 2.5, 1, 1, 2.5, 0],
        false,
      ) +
      rounded(
        [
          [2.5, 19.5],
          [5.5, 10.5],
          [21.75, 10.5],
          [18.75, 19.5],
        ],
        [1, 1.5, 1.5, 1.5],
      ),
    FolderAddIcon: FOLDER + 'M12 10.75V16.25M9.25 13.5H14.75',
    FolderImportIcon: FOLDER + 'M12 9.75V16.5M8.75 13.25L12 16.5L15.25 13.25',
    PhotoAddIcon:
      'M21.5 11.5V18A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6A2.5 2.5 0 0 1 5 3.5H12' +
      PHOTO_RIDGE +
      'M18.5 2V8M15.5 5H21.5',
    PhotoOffIcon: {
      d: PHOTO_FRAME + PHOTO_RIDGE,
      dots: 'M16.5 8h0',
      dotSize: 4.5,
      cut: 'M2.5 2.5L21.5 21.5',
      cutWidth: 5.5,
      over: 'M2.5 2.5L21.5 21.5',
    },
    BookmarkAddIcon: BOOKMARK + 'M12 7.5V12.5M9.5 10H14.5',
    CartIcon: {
      d: rounded(
        [
          [2, 3.5],
          [4.5, 3.5],
          [7, 15.5],
          [19, 15.5],
          [21.25, 7.5],
          [5.4, 7.5],
        ],
        [0, 1.25, 1.25, 1.25, 1.25, 0],
        false,
      ),
      dots: 'M8.75 20.25h0M17.75 20.25h0',
      dotSize: 3.75,
    },
    PackageIcon:
      'M10.77 2.67Q12 2 13.23 2.67L19.77 6.28Q21 6.95 21 8.35L21 15.9Q21 17.3 19.77 17.97L13.23 21.58Q12 22.25 10.77 21.58L4.23 17.97Q3 17.3 3 15.9L3 8.35Q3 6.95 4.23 6.28ZM3.31 7.13L12 11.9L20.69 7.13M12 11.9V21.91M7.66 4.6L16.35 9.45V13.5',
    CylinderIcon: ellipse(12, 5.5, 8, 3) + 'M4 5.5V18.5A8 3 0 0 0 20 18.5V5.5',
    CapsuleIcon: capsule(),
    ShapesIcon:
      rounded(
        [
          [12, 2.25],
          [17, 10.75],
          [7, 10.75],
        ],
        1.25,
      ) +
      rr([2.75, 13.25, 8, 8], 2) +
      circle(17.25, 17.25, 4),
    BotIcon: { d: rr([3.5, 8, 17, 13], 3.5) + 'M12 4V8', dots: 'M8.75 14.5h0M15.25 14.5h0', dotSize: 3.25 },
    SparklesIcon: sparkle([12, 12], 10),
    SettingsIcon: gear(),
    MouseIcon: rr([5.5, 2.5, 13, 19], 6.5) + 'M12 6.5V10',
    KeyboardIcon: {
      d: rr([2, 5, 20, 14], 2.5) + 'M7.5 14.75H16.5',
      dots: 'M6 9.75h0M10 9.75h0M14 9.75h0M18 9.75h0',
      dotSize: 2.25,
    },
    GridIcon: rr([3, 3, 18, 18], 2.5) + 'M9 3V21M15 3V21M3 9H21M3 15H21',
    PrinterIcon:
      rr([6.5, 2.5, 11, 6], 2) +
      rounded(
        [
          [9, 8.5],
          [15, 8.5],
          [12, 12.5],
        ],
        [0, 0, 1],
      ) +
      'M4 16.5H12M4 20.5H20',
    CommentIcon: 'M3 19.5V12A9 9 0 1 1 12 21H4.5A1.5 1.5 0 0 1 3 19.5Z',
  },
  tools: {
    MoveIcon: 'M5.5 3V18.5H21M2.5 6L5.5 3L8.5 6M18 15.5L21 18.5L18 21.5M5.5 18.5L12.5 11.5',
    RotateIcon: { d: loopArrow({ c: [12, 13.25], r: 7.75, from: -45, to: 270 }), dots: 'M12 13.25h0', dotSize: 4.5 },
    ScaleIcon:
      rr([3, 13, 8, 8], 2) +
      'M13 11L20.5 3.5M14.5 3.5H20.5V9.5M3 9.5V5.5A2.5 2.5 0 0 1 5.5 3H9.5M21 14.5V18.5A2.5 2.5 0 0 1 18.5 21H14.5',
    SelectAllIcon:
      'M2.5 7V5A2.5 2.5 0 0 1 5 2.5H7M11 2.5H13M17 2.5H19A2.5 2.5 0 0 1 21.5 5V7M2.5 11V13M21.5 11V12M2.5 17V19A2.5 2.5 0 0 0 5 21.5H7M11 21.5H12' +
      rounded(
        [
          [13, 13],
          [21.5, 16.25],
          [17.5, 17.5],
          [16.25, 21.5],
        ],
        [1, 1, 0.75, 1],
      ),
    BrushIcon: brush(),
    MarkerIcon: marker(),
    EraserIcon: eraser(),
    PenIcon: pen(),
    DrawingIcon: rr([3.5, 11.5, 17, 9.5], 2.5) + 'M3.5 3.5V8M20.5 3.5V8M3.5 5.75H20.5',
    RulerIcon: rr([2, 6, 20, 12], 2.5) + 'M6 6V10M10 6V8.5M14 6V10M18 6V8.5',
    HumanIcon: {
      d: 'M6.5 15V10.5Q6.5 8.5 8.5 8.5H15.5Q17.5 8.5 17.5 10.5V15M10 21.5V12.5M14 21.5V12.5',
      dots: 'M12 4.25h0',
      dotSize: 5,
    },
    DogIcon:
      rounded(
        [
          [2.5, 9.5],
          [5.5, 6.5],
          [7.5, 3.25],
          [9.75, 7],
          [10.5, 9.5],
          [18.5, 9.5],
          [18.5, 14],
          [9, 14],
          [7.25, 11.75],
          [3.5, 11.75],
        ],
        [1, 1.5, 1, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1],
      ) + 'M9.75 14V20.5M17.25 14V20.5M18.5 10Q20.5 9 21 5.75',
    EyedropperIcon: eyedropper(),
    WalkIcon: {
      d: 'M12.25 9L11 14.25M8 13L9.5 10L12.5 9.5L15.5 12L18 12.5M11 14.25L14.25 17L14 21.25M11 14.25L9 18L5.75 20.25',
      dots: 'M13.25 4.25h0',
      dotSize: 5,
    },
    MagnetIcon:
      'M3 4A1.5 1.5 0 0 1 4.5 2.5H7A1.5 1.5 0 0 1 8.5 4V12A3.5 3.5 0 0 0 15.5 12V4A1.5 1.5 0 0 1 17 2.5H19.5A1.5 1.5 0 0 1 21 4V12A9 9 0 0 1 3 12ZM3 7.5H8.5M15.5 7.5H21',
    CrosshairIcon: circle(12, 12, 7.5) + 'M12 2V7M12 17V22M2 12H7M17 12H22',
    HandIcon:
      'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  },
};

const OPTICAL = {
  WarningIcon: [0, -0.5],
  CutIcon: [0.6, 0],
  LockIcon: [0, -0.4],
  UnlockIcon: [0, -0.4],
  FolderOpenIcon: [0.5, 0],
  PhotoAddIcon: [0, 0.5],
  CartIcon: [0.5, -0.25],
  BotIcon: [0, -0.75],
  BrushIcon: [0.5, 0],
  EraserIcon: [-0.5, -0.5],
  WalkIcon: [-0.5, 0],
  ArrowUpRightIcon: [-0.4, 0.4],
};

export const GROUPS = Object.fromEntries(
  Object.entries(DRAWN).map(([group, icons]) => [
    group,
    Object.fromEntries(
      Object.entries(icons).map(([name, spec]) => [name, OPTICAL[name] ? nudge(spec, OPTICAL[name]) : spec]),
    ),
  ]),
);
