import React, { useId } from 'react';

export interface IconProps {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

export type GlyphIcon = React.FC<IconProps>;

export interface GlyphSpec {
  d: string;
  dots?: string;
  dotSize?: number;
  dash?: string;
  cut?: string;
  cutWidth?: number;
  over?: string;
  fill?: boolean;
  weight?: number;
}

const DASH = '2.25 2.75';

export const Glyph: React.FC<IconProps & { children: React.ReactNode }> = ({
  className = 'w-[18px] h-[18px]',
  style,
  strokeWidth = 2,
  children,
}) => {
  const mask = useId();

  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} style={style} aria-hidden="true">
      <mask id={mask} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
        <g
          color="#fff"
          fill="none"
          stroke="#fff"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </g>
      </mask>
      <rect x="-2" y="-2" width="28" height="28" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
};

export const glyph = (spec: GlyphSpec | string): GlyphIcon => {
  const {
    d,
    dots,
    dotSize = 4.5,
    dash,
    cut,
    cutWidth = 5.5,
    over,
    fill,
    weight,
  } = typeof spec === 'string' ? { d: spec } : spec;
  const Icon: GlyphIcon = (props) => (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? weight}>
      {d && <path d={d} fill={fill ? '#fff' : undefined} />}
      {dots && <path d={dots} strokeWidth={dotSize} />}
      {dash && <path d={dash} strokeDasharray={DASH} />}
      {cut && <path d={cut} stroke="#000" strokeWidth={cutWidth} />}
      {over && <path d={over} />}
    </Glyph>
  );

  return Icon;
};
