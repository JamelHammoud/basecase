import React from 'react';
import { fromFeetInches, toFeetInches } from '../three/viewport/measureMath';
import type { FigurePlacements, MeasureKind } from '../three/viewport/types';
import type { MeasureUnit } from '../types/robotics';
import {
  FloatingIsland,
  IconButton,
  IslandDivider,
  NumberInput,
  Tooltip,
  CloseIcon,
  DogIcon,
  HumanIcon,
  RulerIcon,
} from '../design-system';

const ICON = 'w-[22px] h-[22px]';
const MIN_HEIGHT_MM = 300;
const MAX_HEIGHT_MM = 2500;

const KINDS: Array<{ kind: MeasureKind; label: string; icon: React.ReactNode }> = [
  { kind: 'ruler', label: 'Ruler', icon: <RulerIcon className={ICON} /> },
  { kind: 'human', label: 'Human', icon: <HumanIcon className={ICON} /> },
  { kind: 'dog', label: 'Dog', icon: <DogIcon className={ICON} /> },
];

interface MeasureToolbarProps {
  kind: MeasureKind;
  onKind: (kind: MeasureKind) => void;
  figures: FigurePlacements;
  humanHeightMm: number;
  onHumanHeight: (mm: number) => void;
  unit: MeasureUnit;
  onExit: () => void;
}

const clampHeight = (mm: number) => Math.min(MAX_HEIGHT_MM, Math.max(MIN_HEIGHT_MM, mm));

interface HeightInputProps {
  heightMm: number;
  onChange: (mm: number) => void;
}

function FeetInchesInputs({ heightMm, onChange }: HeightInputProps) {
  const { feet, inches } = toFeetInches(heightMm);

  return (
    <>
      <NumberInput
        className="w-[60px]"
        value={feet}
        step={1}
        precision={0}
        unit="ft"
        onChange={(next) => onChange(fromFeetInches({ feet: next, inches }))}
      />
      <NumberInput
        className="w-[68px]"
        value={inches}
        step={1}
        precision={1}
        unit="in"
        onChange={(next) => onChange(fromFeetInches({ feet, inches: next }))}
      />
    </>
  );
}

function HeightField({ heightMm, unit, onChange }: HeightInputProps & { unit: MeasureUnit }) {
  const set = (mm: number) => onChange(clampHeight(mm));

  return (
    <Tooltip label="Height" side="top">
      <div className="px-1 flex gap-1">
        {unit === 'imperial' ? (
          <FeetInchesInputs heightMm={heightMm} onChange={set} />
        ) : (
          <NumberInput
            className="w-[96px]"
            value={heightMm / 10}
            step={1}
            precision={1}
            unit="cm"
            onChange={(cm) => set(cm * 10)}
          />
        )}
      </div>
    </Tooltip>
  );
}

export const MeasureToolbar: React.FC<MeasureToolbarProps> = ({
  kind,
  onKind,
  figures,
  humanHeightMm,
  onHumanHeight,
  unit,
  onExit,
}) => (
  <FloatingIsland className="p-1.5 gap-1 rounded-[20px] animate-pop-up">
    {KINDS.map((k) => (
      <IconButton
        key={k.kind}
        icon={k.icon}
        title={k.label}
        tooltipSide="top"
        size="lg"
        isActive={kind === k.kind}
        onClick={() => onKind(k.kind)}
      />
    ))}
    {figures.human && (
      <>
        <IslandDivider />
        <HeightField heightMm={humanHeightMm} unit={unit} onChange={onHumanHeight} />
      </>
    )}
    <IslandDivider />
    <IconButton
      icon={<CloseIcon className="w-5 h-5" />}
      title="Exit measure"
      shortcut="Esc"
      tooltipSide="top"
      size="lg"
      onClick={onExit}
    />
  </FloatingIsland>
);
