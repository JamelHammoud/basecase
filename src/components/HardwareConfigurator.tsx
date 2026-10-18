import React from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  BEARINGS,
  DRIVES,
  FINISHES,
  HARDWARE_BY_TYPE,
  HardwareSpec,
  LENGTH_STEP,
  THREAD,
  driveOptions,
  familyOf,
  hardwareDimensions,
  hardwareDrive,
  hardwareFinish,
  hardwareNote,
  isMetric,
  isStockLength,
  lengthRange,
  makeSpec,
  nearestStockLengths,
  screwHead,
  screwStandard,
  sizesFor,
  stockLengths,
} from '../data/hardware';
import { IconButton, NumberInput } from '../design-system';
import { SizeLine, SpecList } from './PartDetails';

/**
 * Pick a fastener exactly: type within its family (screw head, nut style…), drive (hex, Torx,
 * Phillips, slotted), size, any length (stock lengths one tap away) and finish. Controlled; used by Parts and the Inspector.
 */
export const HardwareConfigurator: React.FC<{
  spec: HardwareSpec;
  /** `live` while typing or scrubbing the length (skip undo history until commit) */
  onChange: (spec: HardwareSpec, live?: boolean) => void;
}> = ({ spec, onChange }) => {
  const info = HARDWARE_BY_TYPE[spec.type];
  const family = familyOf(spec.type);
  const finish = hardwareFinish(spec);
  const range = lengthRange(spec.type, spec.size);
  const stock = stockLengths(spec);
  const drives = driveOptions(spec.type);
  const drive = hardwareDrive(spec);
  const head = screwHead(spec);
  const set = (type = spec.type, size = spec.size, length = spec.length, f = spec.finish, live?: boolean, dr = spec.drive) =>
    onChange(makeSpec(type, size, length, f, dr), live);
  const sizes = drive ? sizesFor(spec.type, drive) : info.sizes;

  const stepStock = (dir: -1 | 1) => {
    if (spec.length === undefined || !stock.length) return;
    const next = dir > 0 ? stock.find((l) => l > spec.length!) : [...stock].reverse().find((l) => l < spec.length!);
    if (next !== undefined) set(spec.type, spec.size, next);
  };

  const sizeLabel = (s: string) => (spec.type === 'dowel_pin' ? `Ø${s}` : s);
  const d = hardwareDimensions(spec);
  const near = nearestStockLengths(spec);

  return (
    <div className="space-y-4">
      {family.types.length > 1 && (
        <Field label={family.typeLabel ?? 'Type'}>
          <div className={`grid gap-1 ${family.types.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {family.types.map((t) => (
              <Chip key={t.type} active={t.type === spec.type} onClick={() => set(t.type, spec.size, spec.length, spec.finish)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      {drives.length > 1 && (
        <Field label="Drive">
          <div className={`grid gap-1 ${drives.length === 4 ? 'grid-cols-4' : drives.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {drives.map((dr) => (
              <Chip key={dr} active={dr === drive} onClick={() => set(spec.type, spec.size, spec.length, spec.finish, false, dr)}>
                {DRIVES[dr].label}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <Field label={spec.type === 'bearing' ? 'Bearing' : 'Size'}>
        <div className={`grid gap-1 ${spec.type === 'bearing' ? 'grid-cols-3' : 'grid-cols-5'}`}>
          {sizes.map((s) => (
            <Chip key={s} active={s === spec.size} onClick={() => set(spec.type, s, spec.length)}>
              {sizeLabel(s)}
            </Chip>
          ))}
        </div>
      </Field>

      {range && spec.length !== undefined && (
        <Field label="Length">
          <div className="flex items-center gap-1">
            <IconButton
              icon={<Minus className="w-3.5 h-3.5" />}
              title="Shorter stock length"
              size="sm"
              disabled={!stock.some((l) => l < spec.length!)}
              onClick={() => stepStock(-1)}
            />
            <NumberInput
              className="flex-1"
              label="L"
              title="Length under the head"
              unit="mm"
              value={spec.length}
              min={range.min}
              max={range.max}
              step={LENGTH_STEP}
              precision={1}
              onChange={(v, live) => set(spec.type, spec.size, v, spec.finish, live)}
            />
            <IconButton
              icon={<Plus className="w-3.5 h-3.5" />}
              title="Longer stock length"
              size="sm"
              disabled={!stock.some((l) => l > spec.length!)}
              onClick={() => stepStock(1)}
            />
          </div>
          <div className="grid grid-cols-6 gap-1">
            {stock.map((l) => (
              <Chip key={l} small active={l === spec.length} onClick={() => set(spec.type, spec.size, l)}>
                {l}
              </Chip>
            ))}
          </div>
          {!isStockLength(spec) && (
            <p className="text-[12.5px] text-amber-300/80 leading-relaxed">
              {spec.length > stock[stock.length - 1]
                ? `Longer than stock ${spec.size} (${stock[stock.length - 1]} mm). Cut threaded rod to length.`
                : `Not a stock length. Nearest: ${near.map((l) => `${l}`).join(' or ')} mm.`}
            </p>
          )}
        </Field>
      )}

      {info.finishes.length > 1 && (
        <Field label="Finish">
          <div className={`grid gap-1 ${info.finishes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {FINISH_ORDER.filter((f) => info.finishes.includes(f)).map((f) => (
              <Chip key={f} active={f === finish} onClick={() => set(spec.type, spec.size, spec.length, f)}>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20" style={{ background: FINISHES[f].color }} />
                  <span className="truncate">{FINISHES[f].label}</span>
                </span>
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <SpecList
        rows={[
          ['Size', <SizeLine key="s" w={d.width} h={d.height} d={d.depth} />],
          ...(isMetric(spec.size)
            ? ([['Thread', `${spec.size} × ${THREAD[spec.size].pitch}`]] as Array<[string, string]>)
            : spec.type === 'bearing'
              ? ([['Bore · OD · Width', `${BEARINGS[spec.size].d} · ${BEARINGS[spec.size].D} · ${BEARINGS[spec.size].B} mm`]] as Array<[string, string]>)
              : []),
          ['Standard', screwStandard(spec) || info.description],
          ...(head
            ? ([
                [
                  'Head',
                  `Ø${head.dk} × ${head.k} mm · ${
                    head.recess.kind === 'hex'
                      ? `${head.recess.s} mm hex key`
                      : head.recess.kind === 'slot'
                        ? `${head.recess.width} mm slot`
                        : head.recess.size
                  }`,
                ],
              ] as Array<[string, string]>)
            : []),
        ]}
      />
      <p className="text-[12.5px] text-white/50 leading-relaxed">{hardwareNote(spec)}</p>
    </div>
  );
};

/** Same order for every type, so switching the head never moves the chips */
const FINISH_ORDER = Object.keys(FINISHES) as Array<keyof typeof FINISHES>;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className="text-[12.5px] font-medium text-white/45">{label}</div>
    {children}
  </div>
);

/** Option chip: sizes and stock lengths */
export const Chip: React.FC<{ active?: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  small,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`${small ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]'} min-w-0 px-1.5 rounded-lg font-medium tabular cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
      active ? 'bg-[#0d99ff] text-white' : 'bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white/90'
    }`}
  >
    {children}
  </button>
);
