import type { ImageAnnotation } from '../../vision/frameSet';
import type { LabelTool } from './labelKeys';

interface Props {
  label: ImageAnnotation;
  selected: boolean;
  name: string;
  tool: LabelTool;
  scale: number;
}

export default function LabelOverlay({ label, selected, name, tool, scale }: Props) {
  const [x, y, width, height] = label.box;
  const corners = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const path = label.polygons.map((ring) => `M${ring.join(' ')}Z`).join(' ');

  return (
    <g data-instance={label.instance} aria-label={`${name}${label.review === 'suggested' ? ', unreviewed' : ''}`}>
      <path
        d={path}
        fill={selected ? '#0d99ff' : '#fff'}
        fillOpacity={selected ? 0.18 : 0.05}
        fillRule="evenodd"
        stroke={selected ? '#0d99ff' : '#fff'}
        strokeWidth={selected ? 2 : 1}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={label.review === 'suggested' ? '5 4' : undefined}
      />
      <text
        x={x + 3 * scale}
        y={y + 15 * scale}
        fill="#fff"
        fontSize={12 * scale}
        paintOrder="stroke"
        stroke="#222"
        strokeWidth={3 * scale}
        pointerEvents="none"
      >
        {name}
      </text>
      {label.keypoints
        .filter((point) => point.visible)
        .map((point) => (
          <g key={point.name} pointerEvents="none">
            <circle
              cx={point.x}
              cy={point.y}
              r={3 * scale}
              fill={selected ? '#0d99ff' : '#fff'}
              stroke="#fff"
              strokeWidth={scale}
            />
            <text
              x={point.x + 5 * scale}
              y={point.y}
              fill="#fff"
              fontSize={12 * scale}
              paintOrder="stroke"
              stroke="#222"
              strokeWidth={3 * scale}
            >
              {point.name}
            </text>
          </g>
        ))}
      {selected &&
        tool === 'box' &&
        corners.map(([cx, cy], index) => (
          <rect
            key={index}
            data-corner={index}
            x={cx - 5 * scale}
            y={cy - 5 * scale}
            width={10 * scale}
            height={10 * scale}
            fill="#fff"
            stroke="#0d99ff"
            strokeWidth={scale}
          />
        ))}
      {selected &&
        tool === 'polygon' &&
        label.polygons.map((ring, polygon) =>
          ring.flatMap((value, index) =>
            index % 2
              ? []
              : [
                  <circle
                    key={`${polygon}-${index}`}
                    data-vertex={index}
                    data-polygon={polygon}
                    cx={value}
                    cy={ring[index + 1]}
                    r={5 * scale}
                    fill="#fff"
                    stroke="#0d99ff"
                    strokeWidth={scale}
                  />,
                ],
          ),
        )}
    </g>
  );
}
