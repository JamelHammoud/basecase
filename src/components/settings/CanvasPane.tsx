import React from 'react';
import { MeasureUnit, TrackpadGestureMode } from '../../types/robotics';
import { IS_MAC } from '../../utils/os';
import { modifierName, SegmentedControl, Switch } from '../../design-system';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

export interface CanvasPaneProps {
  sculptEnabled: boolean;
  onSculptEnabled: (v: boolean) => void;
  snapStepMm: number;
  onSnapStep: (mm: number) => void;
  snapAngleDeg: number;
  onSnapAngle: (deg: number) => void;
  measureUnit: MeasureUnit;
  onMeasureUnit: (unit: MeasureUnit) => void;
  trackpadMode: TrackpadGestureMode;
  onTrackpadMode: (mode: TrackpadGestureMode) => void;
}

const MOVE_SNAP_STEPS = ['0', '1', '2', '5', '10'];
const ROTATE_SNAP_STEPS = ['0', '5', '15', '45', '90'];
const MEASURE_UNITS: Array<{ value: MeasureUnit; label: string }> = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

const SCROLL_HINTS: Record<TrackpadGestureMode, string> = {
  'orbit-scroll': `Hold ${modifierName('⇧')} while scrolling to pan. Pinch to zoom.`,
  'pan-scroll': 'Drag the canvas to orbit. Pinch to zoom.',
  'zoom-scroll': 'Drag the canvas to orbit. Right-drag or middle-drag to pan.',
};

const SCROLL_LABEL = IS_MAC ? 'Two-finger scroll' : 'Scroll';
const ROTATE_LABEL = 'Rotate';
const UNITS_LABEL = 'Units';
const SCULPT_LABEL = 'Sculpt';

export const CanvasPane: React.FC<CanvasPaneProps> = (p) => (
  <>
    <Group title={IS_MAC ? 'Trackpad' : 'Mouse and touchpad'}>
      <Row label={SCROLL_LABEL} hint={SCROLL_HINTS[p.trackpadMode]}>
        <SegmentedControl<TrackpadGestureMode>
          className="w-[240px]"
          aria-label={SCROLL_LABEL}
          value={p.trackpadMode}
          onChange={p.onTrackpadMode}
          options={[
            { value: 'orbit-scroll', label: 'Orbit' },
            { value: 'pan-scroll', label: 'Pan' },
            { value: 'zoom-scroll', label: 'Zoom' },
          ]}
        />
      </Row>
    </Group>
    <Group title="Snapping">
      <Row
        label={
          <>
            Move <span className="text-white/50">mm</span>
          </>
        }
      >
        <SegmentedControl
          className="w-[240px]"
          aria-label="Move mm"
          value={String(p.snapStepMm)}
          onChange={(v) => p.onSnapStep(Number(v))}
          options={MOVE_SNAP_STEPS.map((v) => ({ value: v, label: v === '0' ? 'Off' : v }))}
        />
      </Row>
      <Row label={ROTATE_LABEL}>
        <SegmentedControl
          className="w-[240px]"
          aria-label={ROTATE_LABEL}
          value={String(p.snapAngleDeg)}
          onChange={(v) => p.onSnapAngle(Number(v))}
          options={ROTATE_SNAP_STEPS.map((v) => ({ value: v, label: v === '0' ? 'Off' : `${v}°` }))}
        />
      </Row>
    </Group>
    <Group title="Measure">
      <Row label={UNITS_LABEL}>
        <SegmentedControl<MeasureUnit>
          className="w-[240px]"
          aria-label={UNITS_LABEL}
          value={p.measureUnit}
          onChange={p.onMeasureUnit}
          options={MEASURE_UNITS}
        />
      </Row>
    </Group>
    <Group title="Tools">
      <Row label={SCULPT_LABEL}>
        <Switch aria-label={SCULPT_LABEL} checked={p.sculptEnabled} onChange={p.onSculptEnabled} />
      </Row>
    </Group>
  </>
);
