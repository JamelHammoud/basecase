import { encode } from 'uqr';

const MODULE_PX = 6;

function modulesPath(rows: boolean[][]): string {
  return rows.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
}

export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, data } = encode(text, { ecc: 'M', border: 2 });

  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="phone-qr"
      viewBox={`0 0 ${size} ${size}`}
      width={size * MODULE_PX}
      height={size * MODULE_PX}
      shapeRendering="crispEdges"
      className="rounded-[12px] bg-white"
    >
      <path d={modulesPath(data)} fill="#000000" />
    </svg>
  );
}
