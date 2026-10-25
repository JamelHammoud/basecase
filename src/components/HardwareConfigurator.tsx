import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DRIVES,
  FINISHES,
  HARDWARE_BY_TYPE,
  HardwareSpec,
  HardwareType,
  LENGTH_STEP,
  THREAD,
  driveOptions,
  familyOf,
  hardwareDimensions,
  hardwareDrive,
  hardwareFinish,
  hardwareHoleRows,
  isMetric,
  isStockLength,
  lengthRange,
  makeSpec,
  motionOf,
  nearestStockLengths,
  recessLabel,
  screwHead,
  screwStandard,
  setScrewRecess,
  stockLengths,
} from '../data/hardware';
import { PART_CATALOG, hardwareVariant } from '../data/catalog';
import { usePartThumbnail } from '../three/partThumbnails';
import {
  CHOICE_TRACK,
  ChoiceGrid,
  DriveIcon,
  IconButton,
  NumberInput,
  Section,
  choiceCellClass,
  MinusIcon,
  PlusIcon,
} from '../design-system';
import { SizeLine, SpecRow } from './PartDetails';
import { InsertLengthSection } from './InsertLengthSection';

type OnChange = (spec: HardwareSpec, live?: boolean) => void;

export const HardwareConfigurator: React.FC<{
  spec: HardwareSpec;
  onChange: OnChange;
}> = ({ spec, onChange }) => {
  const info = HARDWARE_BY_TYPE[spec.type];
  const family = familyOf(spec.type);
  const drives = driveOptions(spec.type);
  const drive = hardwareDrive(spec);
  const set = (next: Partial<HardwareSpec>, live?: boolean) => {
    const s = { ...spec, ...next };

    onChange(makeSpec(s.type, { size: s.size, length: s.length, finish: s.finish, drive: s.drive }), live);
  };
  const recess = screwHead(spec)?.recess ?? setScrewRecess(spec)?.recess;
  const motion = motionOf(spec.type);

  return (
    <>
      {family.types.length > 1 && (
        <Section title={family.typeLabel ?? 'Type'}>
          <div
            role="radiogroup"
            aria-label={family.typeLabel ?? 'Type'}
            className={`grid gap-x-[8px] gap-y-[10px] ${family.types.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
          >
            {family.types.map((t) => (
              <TypeTile
                key={t.type}
                type={t.type}
                label={t.label}
                spec={spec}
                selected={t.type === spec.type}
                onSelect={() => set({ type: t.type })}
              />
            ))}
          </div>
        </Section>
      )}

      {drives.length > 1 && (
        <Section
          title="Drive"
          actions={recess && <span className="mr-1 text-[12.5px] text-white/45 tabular">{recessLabel(recess)}</span>}
        >
          <ChoiceGrid
            label="Drive"
            stacked
            columns={drives.length}
            value={drive}
            onChange={(d) => set({ drive: d })}
            options={drives.map((d) => ({
              value: d,
              label: DRIVES[d].label,
              icon: <DriveIcon drive={d} className="w-5 h-5" />,
            }))}
          />
        </Section>
      )}

      <Section title="Size">
        <ChoiceGrid
          label="Size"
          columns={motion?.sizeColumns ?? 5}
          value={spec.size}
          onChange={(size) => set({ size })}
          options={info.sizes.map((s) => ({ value: s, label: motion?.sizeLabel?.(s) ?? s }))}
        />
      </Section>

      {lengthControl(spec, set)}

      {info.finishes.length > 1 && (
        <Section title="Finish">
          <ChoiceGrid
            label="Finish"
            columns={Math.min(3, info.finishes.length)}
            value={hardwareFinish(spec)}
            onChange={(finish) => set({ finish })}
            options={FINISH_ORDER.filter((f) => info.finishes.includes(f)).map((f) => ({
              value: f,
              label: FINISHES[f].label,
              icon: (
                <span
                  className="w-3 h-3 rounded-full ring-1 ring-inset ring-white/25"
                  style={{ background: FINISHES[f].color }}
                />
              ),
            }))}
          />
        </Section>
      )}
    </>
  );
};

export const HardwareSpecs: React.FC<{ spec: HardwareSpec; collapsible?: boolean; holeAction?: React.ReactNode }> = ({
  spec,
  collapsible = false,
  holeAction,
}) => {
  const d = hardwareDimensions(spec);
  const head = screwHead(spec);
  const standard = screwStandard(spec);
  const holes = hardwareHoleRows(spec);
  const facts = motionOf(spec.type)?.facts(spec) ?? [];

  return (
    <>
      <Section title="Specs" collapsible={collapsible} defaultOpen={!collapsible}>
        <dl className="-my-[5px]">
          <SpecRow label="Size">
            <SizeLine w={d.width} h={d.height} d={d.depth} />
          </SpecRow>
          {isMetric(spec.size) && (
            <SpecRow label="Thread">
              {spec.size} × {THREAD[spec.size].pitch}
              <Unit>pitch</Unit>
            </SpecRow>
          )}
          {facts.map((f) => (
            <SpecRow key={f.label} label={f.label}>
              {f.value}
              {f.unit && <Unit>{f.unit}</Unit>}
            </SpecRow>
          ))}
          {standard && <SpecRow label="Standard">{standard}</SpecRow>}
          {head && (
            <SpecRow label="Head">
              Ø{head.dk} × {head.k}
              <Unit>mm</Unit>
            </SpecRow>
          )}
        </dl>
      </Section>
      {holes.length > 0 && (
        <Section title="Holes" collapsible={collapsible} defaultOpen={!collapsible} actions={holeAction}>
          <dl className="-my-[5px]">
            {holes.map((h) => (
              <SpecRow key={h.label} label={h.label}>
                {h.value}
                <Unit>{h.unit}</Unit>
              </SpecRow>
            ))}
          </dl>
        </Section>
      )}
    </>
  );
};

const Unit: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-white/40"> {children}</span>
);

const FINISH_ORDER = Object.keys(FINISHES) as Array<keyof typeof FINISHES>;

const TypeTile: React.FC<{
  type: HardwareType;
  label: string;
  spec: HardwareSpec;
  selected: boolean;
  onSelect: () => void;
}> = ({ type, label, spec, selected, onSelect }) => {
  const base = PART_CATALOG.find((c) => c.hardware?.type === type);
  const item =
    base && hardwareVariant(base, makeSpec(type, { size: spec.size, finish: spec.finish, drive: spec.drive }));
  const thumb = usePartThumbnail(item);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group min-w-0 cursor-default"
    >
      <span
        className={`preview preview-sm block aspect-[4/3] group-active:scale-[0.97] transition-[background-color,transform] duration-150 ${
          selected ? 'ring-[1.5px] ring-inset ring-[#0d99ff]/70' : ''
        }`}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="w-full h-full object-contain p-1 animate-fade-in transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
          />
        ) : (
          <span className="block w-full h-full shimmer" />
        )}
      </span>
      <span
        className={`block mt-[6px] text-center text-[12.5px] font-medium truncate transition-colors duration-150 ${
          selected ? 'text-white/90' : 'text-white/55 group-hover:text-white/80'
        }`}
      >
        {label}
      </span>
    </button>
  );
};

function lengthControl(spec: HardwareSpec, set: (next: Partial<HardwareSpec>, live?: boolean) => void) {
  const range = lengthRange(spec.type, spec.size);

  if (HARDWARE_BY_TYPE[spec.type].stockOnly) return <InsertLengthSection spec={spec} set={set} />;

  if (!range || spec.length === undefined) return null;

  return <LengthSection spec={spec} min={range.min} max={range.max} set={set} />;
}

const LengthSection: React.FC<{
  spec: HardwareSpec;
  min: number;
  max: number;
  set: (next: Partial<HardwareSpec>, live?: boolean) => void;
}> = ({ spec, min, max, set }) => {
  const length = spec.length!;
  const stock = stockLengths(spec);
  const shorter = [...stock].reverse().find((l) => l < length);
  const longer = stock.find((l) => l > length);
  const near = nearestStockLengths(spec);

  return (
    <Section title="Length">
      <div className="flex items-center gap-1">
        <IconButton
          icon={<MinusIcon className="w-3.5 h-3.5" />}
          title="Shorter stock length"
          size="sm"
          disabled={shorter === undefined}
          onClick={() => shorter !== undefined && set({ length: shorter })}
        />
        <NumberInput
          className="flex-1"
          label="L"
          title="Length under the head"
          unit="mm"
          value={length}
          min={min}
          max={max}
          step={LENGTH_STEP}
          precision={1}
          onChange={(v, live) => set({ length: v }, live)}
        />
        <IconButton
          icon={<PlusIcon className="w-3.5 h-3.5" />}
          title="Longer stock length"
          size="sm"
          disabled={longer === undefined}
          onClick={() => longer !== undefined && set({ length: longer })}
        />
      </div>
      {stock.length > 0 && <StockStrip lengths={stock} value={length} onPick={(l) => set({ length: l })} />}
      {!isStockLength(spec) && !motionOf(spec.type)?.cutToLength && (
        <p className="text-[12.5px] text-amber-300/80 leading-relaxed">
          {length > stock[stock.length - 1] ? (
            `Longer than stock ${spec.size} (${stock[stock.length - 1]} mm). Cut threaded rod to length.`
          ) : (
            <>
              Not a stock length. Nearest:{' '}
              {near.map((l, i) => (
                <React.Fragment key={l}>
                  {i > 0 && ' or '}
                  <button
                    type="button"
                    onClick={() => set({ length: l })}
                    className="underline decoration-amber-300/40 underline-offset-2 hover:text-amber-200 cursor-default"
                  >
                    {l}
                  </button>
                </React.Fragment>
              ))}{' '}
              mm.
            </>
          )}
        </p>
      )}
    </Section>
  );
};

const StockStrip: React.FC<{ lengths: number[]; value: number; onPick: (l: number) => void }> = ({
  lengths,
  value,
  onPick,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const placed = useRef(false);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;

      setFade((f) => (f.left === left && f.right === right ? f : { left, right }));
    };

    update();
    el.addEventListener('scroll', update, { passive: true });

    const resize = new ResizeObserver(update);

    resize.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    const i = Math.max(
      0,
      lengths.findIndex((l) => l >= value),
    );
    const cell = el.children[i] as HTMLElement | undefined;

    if (!cell) return;

    el.scrollTo({
      left: cell.offsetLeft - (el.clientWidth - cell.offsetWidth) / 2,
      behavior: placed.current ? 'smooth' : 'auto',
    });
    placed.current = true;
  }, [value, lengths]);

  const mask =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? 'transparent, #000 28px' : '#000'}, ${fade.right ? '#000 calc(100% - 28px), transparent' : '#000'})`
      : undefined;

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label="Stock lengths"
      className={`relative flex overflow-x-auto overflow-y-hidden no-scrollbar ${CHOICE_TRACK}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {lengths.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === value}
          onClick={() => onPick(l)}
          className={`shrink-0 min-w-[40px] h-7 px-1.5 text-[12.5px] ${choiceCellClass(l === value)}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
};
