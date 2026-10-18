import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleCheck, CircleMinus, CircleX, ExternalLink, FileSpreadsheet, Plus, TriangleAlert, X } from 'lucide-react';
import {
  Button,
  IconButton,
  MenuItem,
  MenuLabel,
  NumberInput,
  PopoverMenu,
  Section,
  Select,
  TextInput,
  Tooltip,
  useScrollFade,
} from '../design-system';
import { SUPPLIES, SUPPLY_BY_ID, SupplyGroup } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PrintMaterial, ProjectSettings, PurchaseRecord, ScenePart } from '../types/robotics';
import { Bom, BomCategory, BomLine, buildBom, bomToCsv, bomToMarkdown, localDate, parseAsin, STALE_DAYS } from '../utils/bom';
import { platformBridge } from '../utils/platformBridge';
import { PrintReport, buildPrintReport, fmtSize } from '../utils/printReport';
import { ENGINEERING_CHECKS } from '../utils/engineering';
import type { CheckRow, EngineeringReport } from '../utils/engineering';

interface BuildPanelProps {
  parts: ScenePart[];
  sceneName: string;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  /** Exact mesh measurements of the scene's parts (from the viewport) */
  measure: () => Record<string, MeshMeasure>;
  /** A part's triangles in its own frame, for printability */
  getTriangles: (id: string) => Float32Array | null;
  onSelectParts: (ids: string[]) => void;
  onToast: (message: string) => void;
  /** Runs the engineering checks, joint sweeps included */
  onRunChecks: () => EngineeringReport;
}

const MATERIALS: Array<{ value: PrintMaterial; label: string }> = [
  { value: 'PLA', label: 'PLA' },
  { value: 'PETG', label: 'PETG' },
  { value: 'ABS', label: 'ABS' },
  { value: 'ASA', label: 'ASA' },
];

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Purchase records are app-wide; every Build tab shares one copy */
let purchaseCache: Record<string, PurchaseRecord> | null = null;
const purchaseListeners = new Set<(p: Record<string, PurchaseRecord>) => void>();
function usePurchases(): [Record<string, PurchaseRecord>, (key: string, r: PurchaseRecord | null) => Promise<void>] {
  const [purchases, setPurchases] = useState<Record<string, PurchaseRecord>>(purchaseCache ?? {});
  useEffect(() => {
    purchaseListeners.add(setPurchases);
    if (!purchaseCache)
      platformBridge.listPurchases().then((p) => {
        purchaseCache = p;
        purchaseListeners.forEach((l) => l(p));
      });
    return () => {
      purchaseListeners.delete(setPurchases);
    };
  }, []);
  const save = async (key: string, record: PurchaseRecord | null) => {
    const next = await platformBridge.savePurchase(key, record);
    purchaseCache = next;
    purchaseListeners.forEach((l) => l(next));
  };
  return [purchases, save];
}

export const BuildPanel: React.FC<BuildPanelProps> = ({ parts, sceneName, project, onChangeProject, measure, getTriangles, onSelectParts, onToast, onRunChecks }) => {
  const [purchases, savePurchase] = usePurchases();
  const [measures, setMeasures] = useState<Record<string, MeshMeasure>>({});
  const [print, setPrint] = useState<PrintReport | null>(null);
  const [checking, setChecking] = useState<BomLine | null>(null);
  const { ref: setScroller, style: fadeStyle } = useScrollFade();

  // Meshes update after the viewport renders the new parts; measure once they've settled
  useEffect(() => {
    const t = window.setTimeout(() => {
      setMeasures(measure());
      setPrint(buildPrintReport(parts, project, getTriangles));
    }, 250);
    return () => window.clearTimeout(t);
  }, [parts, project, measure, getTriangles]);

  const supportG = useMemo(() => {
    const out: Partial<Record<PrintMaterial, number>> = {};
    for (const r of print?.parts ?? []) out[r.material] = (out[r.material] ?? 0) + r.supportG;
    return out;
  }, [print]);
  const bom = useMemo(() => buildBom(parts, project, purchases, measures, undefined, supportG), [parts, project, purchases, measures, supportG]);
  const names = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p.name])), [parts]);
  const file = sceneName.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'robot';

  const exportCsv = () => {
    download(`${file}-bom.csv`, bomToCsv(bom, names), 'text/csv');
    onToast('Exported BOM');
  };
  const exportMarkdown = () => {
    download(`${file}-bom.md`, bomToMarkdown(bom, sceneName), 'text/markdown');
    onToast('Exported BOM');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={setScroller} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <BudgetSection bom={bom} project={project} onChangeProject={onChangeProject} />
        <ChecksSection parts={parts} project={project} onRun={onRunChecks} onSelectParts={onSelectParts} />
        <BuyList bom={bom} onCheck={setChecking} onSelectParts={onSelectParts} onExportCsv={exportCsv} onExportMarkdown={exportMarkdown} />
        <ExtrasSection project={project} onChangeProject={onChangeProject} />
        <PrintedSection report={print} project={project} onChangeProject={onChangeProject} onSelectParts={onSelectParts} />
      </div>
      {checking && (
        <CheckSheet
          line={checking}
          onClose={() => setChecking(null)}
          onSave={async (record) => {
            await savePurchase(checking.key, record);
            setChecking(null);
            onToast(record ? `Saved price for ${checking.name}` : `Removed price for ${checking.name}`);
          }}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const BudgetSection: React.FC<{ bom: Bom; project: ProjectSettings; onChangeProject: BuildPanelProps['onChangeProject'] }> = ({
  bom,
  project,
  onChangeProject,
}) => {
  const t = bom.totals;
  const budget = project.budgetUsd;
  const share = budget ? Math.min(1, t.pricedUsd / budget) : 0;
  const estShare = budget ? Math.min(1, t.estimatedUsd / budget) : 0;
  const hasEstimate = t.estimatedUsd > t.pricedUsd + 0.005;
  const lines = t.checked + t.stale + t.unchecked;
  return (
    <Section title="Budget">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-semibold tabular-nums text-white/90 leading-tight">{money(t.pricedUsd)}</div>
          {/* No caption when the list is empty: the $0 total already says it */}
          {lines > 0 && (
            <div className="text-[12.5px] text-white/45 mt-0.5 tabular-nums">
              {t.unchecked ? `${t.checked + t.stale} of ${lines} prices checked` : 'All prices checked'}
            </div>
          )}
          {hasEstimate && (
            <Tooltip label="Unchecked lines at maker and distributor list prices">
              <div className="text-[12.5px] text-white/60 mt-0.5 tabular-nums w-fit">≈ {money(t.estimatedUsd)} estimated{t.unpriced ? ` · ${t.unpriced} unpriced` : ''}</div>
            </Tooltip>
          )}
        </div>
        <div className="w-[112px] shrink-0">
          <NumberInput
            label="$"
            value={budget ?? 0}
            min={0}
            step={10}
            precision={0}
            unit=""
            title="Budget in US dollars"
            onChange={(v, live) => !live && onChangeProject({ budgetUsd: v > 0 ? v : undefined })}
          />
        </div>
      </div>
      {budget !== undefined && (
        <div className="relative h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-label="Spent of budget">
          {hasEstimate && (
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${t.estimatedUsd > budget ? 'bg-red-500/40' : 'bg-[#0d99ff]/35'}`}
              style={{ width: `${estShare * 100}%` }}
            />
          )}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${t.overBudget ? 'bg-red-500' : 'bg-[#0d99ff]'}`}
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
      {budget !== undefined && (
        <div className={`text-[12.5px] tabular-nums ${t.overBudget ? 'text-red-400' : 'text-white/45'}`}>
          {t.overBudget ? `${money(t.pricedUsd - budget)} over budget` : `${money(budget - t.pricedUsd)} left`}
          {t.unchecked > 0 && ` · ${t.unchecked} to price`}
        </div>
      )}
      {t.stale > 0 && (
        <div className="text-[12.5px] text-amber-400">
          Recheck {t.stale} {t.stale === 1 ? 'price' : 'prices'} before ordering. {t.stale === 1 ? 'It’s' : 'They’re'} over {STALE_DAYS} days old.
        </div>
      )}
    </Section>
  );
};

/* ------------------------------------------------------------------ */

const STATUS_ICON: Record<CheckRow['status'], React.ReactNode> = {
  pass: <CircleCheck className="w-4 h-4 text-emerald-400" />,
  warn: <TriangleAlert className="w-4 h-4 text-amber-400" />,
  fail: <CircleX className="w-4 h-4 text-red-400" />,
  'not run': <CircleMinus className="w-4 h-4 text-white/35" />,
};

const ChecksSection: React.FC<{
  parts: ScenePart[];
  project: ProjectSettings;
  onRun: () => EngineeringReport;
  onSelectParts: (ids: string[]) => void;
}> = ({ parts, project, onRun, onSelectParts }) => {
  const [report, setReport] = useState<{ r: EngineeringReport; parts: ScenePart[]; project: ProjectSettings } | null>(null);
  const [running, setRunning] = useState(false);
  const stale = report && (report.parts !== parts || report.project !== project);
  const run = () => {
    setRunning(true);
    // Let the button show its state before the sweep blocks the thread
    window.setTimeout(() => {
      try {
        setReport({ r: onRun(), parts, project });
      } finally {
        setRunning(false);
      }
    }, 30);
  };
  const rows: CheckRow[] = report ? report.r.rows : ENGINEERING_CHECKS.map((check) => ({ check, status: 'not run', detail: '' }));
  return (
    <Section
      title="Checks"
      actions={
        <Button variant="secondary" size="xs" onClick={run} disabled={running || !parts.length}>
          {running ? 'Checking…' : report ? 'Run Again' : 'Run Checks'}
        </Button>
      }
    >
      {stale && <p className="text-[12.5px] text-white/45">The model changed since this run</p>}
      <ul className="-mx-[7px]">
        {rows.map((row) => (
          <li key={row.check}>
            <button
              type="button"
              onClick={() => row.ids?.length && onSelectParts(row.ids)}
              className={`w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg text-left cursor-default ${report ? 'hover:bg-white/[0.04]' : ''}`}
            >
              <span className="h-[18px] flex items-center shrink-0">{STATUS_ICON[row.status]}</span>
              <span className="min-w-0">
                <span className={`block text-[13px] leading-[18px] ${report ? 'text-white/90' : 'text-white/60'}`}>{row.check}</span>
                {row.detail && <span className="block text-[12px] text-white/45">{row.detail}</span>}
              </span>
            </button>
            {/* One line per problem, each selecting its own parts */}
            {!!row.items?.length && (
              <ul className="pl-[24px] pb-1">
                {row.items.map((item, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => item.ids?.length && onSelectParts(item.ids)}
                      className="w-full py-1 px-[7px] rounded-md text-left text-[12px] leading-[16px] text-white/60 hover:bg-white/[0.04] hover:text-white/85 cursor-default"
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
};

/* ------------------------------------------------------------------ */

const CATEGORY_TITLES: Record<BomCategory, string> = {
  Components: 'Components',
  Hardware: 'Hardware',
  Supplies: 'Supplies',
  Filament: 'Filament',
};

const BuyList: React.FC<{
  bom: Bom;
  onCheck: (line: BomLine) => void;
  onSelectParts: (ids: string[]) => void;
  onExportCsv: () => void;
  onExportMarkdown: () => void;
}> = ({ bom, onCheck, onSelectParts, onExportCsv, onExportMarkdown }) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const groups = (['Components', 'Hardware', 'Supplies', 'Filament'] as BomCategory[])
    .map((c) => [c, bom.lines.filter((l) => l.category === c)] as const)
    .filter(([, ls]) => ls.length);
  return (
    <Section
      title="Parts to buy"
      actions={
        bom.lines.length > 0 && (
          <div className="relative" ref={ref}>
            <IconButton
              icon={<FileSpreadsheet className="w-4 h-4" />}
              title="Export BOM"
              size="xs"
              onClick={() => setMenu((v) => !v)}
            />
            <PopoverMenu isOpen={menu} onClose={() => setMenu(false)} ignoreRef={ref} position="bottom" align="end" className="w-48">
              <MenuItem label="CSV Spreadsheet" onSelect={() => (setMenu(false), onExportCsv())} />
              <MenuItem label="Markdown" onSelect={() => (setMenu(false), onExportMarkdown())} />
            </PopoverMenu>
          </div>
        )
      }
    >
      {!groups.length && <span className="text-[13px] text-white/45">No parts</span>}
      {groups.map(([cat, ls]) => (
        <div key={cat}>
          <div className="text-[12px] font-medium text-white/40 mb-1">{CATEGORY_TITLES[cat]}</div>
          <ul className="-mx-[7px]">
            {ls.map((l) => (
              <BuyRow key={l.key} line={l} onCheck={() => onCheck(l)} onSelect={() => l.partIds.length && onSelectParts(l.partIds)} />
            ))}
          </ul>
        </div>
      ))}
      {bom.standIns.length > 0 && (
        <Notice
          tone="amber"
          text={`Replace ${bom.standIns.length} ${bom.standIns.length === 1 ? 'stand-in' : 'stand-ins'} with real parts`}
          onClick={() => onSelectParts(bom.standIns.map((s) => s.id))}
        />
      )}
      {bom.madeElsewhere.length > 0 && (
        <Notice
          tone="default"
          text={`Find a source for ${bom.madeElsewhere.length} ${bom.madeElsewhere.length === 1 ? 'part' : 'parts'} (${[...new Set(bom.madeElsewhere.map((m) => m.process))].join(', ')})`}
          onClick={() => onSelectParts(bom.madeElsewhere.map((s) => s.id))}
        />
      )}
    </Section>
  );
};

const Notice: React.FC<{ tone: 'amber' | 'default'; text: string; onClick: () => void }> = ({ tone, text, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-start gap-2 text-left text-[12.5px] rounded-lg px-2.5 py-2 cursor-default transition-colors ${
      tone === 'amber' ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/15' : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.07]'
    }`}
  >
    <AlertTriangle className="w-3.5 h-3.5 mt-[1px] shrink-0" />
    {text}
  </button>
);

const BuyRow: React.FC<{ line: BomLine; onCheck: () => void; onSelect: () => void }> = ({ line: l, onCheck, onSelect }) => {
  const qty = l.unit === 'g' ? `${l.qty.toLocaleString('en-US')} g` : `${l.qty}×`;
  const packs = l.packs && (l.record || l.unit === 'g') ? ` · ${l.packs} ${l.unit === 'g' ? (l.packs === 1 ? 'spool' : 'spools') : l.packs === 1 ? 'pack' : 'packs'}` : '';
  return (
    <li className="group flex items-center gap-2 h-[44px] px-[7px] rounded-lg hover:bg-white/[0.04]">
      <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left cursor-default">
        <div className="text-[13px] text-white/90 truncate">{l.name}</div>
        <div className="text-[12px] text-white/40 truncate tabular-nums">
          {qty}
          {packs}
          {l.warning && <span className="text-amber-400"> · {l.warning}</span>}
        </div>
      </button>
      {l.url && (
        <Tooltip label={l.urlKind === 'product' ? 'Open listing' : 'Search Amazon'}>
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            aria-label={l.urlKind === 'product' ? 'Open listing' : 'Search Amazon'}
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.07] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[opacity,color,background-color] duration-150 cursor-default"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </Tooltip>
      )}
      {l.record ? (
        <Tooltip label={`Checked ${l.record.checkedAt}${l.status === 'stale' ? ', over 60 days ago' : ''}`}>
          <button
            type="button"
            onClick={onCheck}
            className={`shrink-0 text-right text-[13px] tabular-nums rounded-md px-1.5 h-7 cursor-default hover:bg-white/[0.07] ${
              l.status === 'stale' ? 'text-amber-400' : 'text-white/90'
            }`}
          >
            {l.lineUsd !== undefined ? money(l.lineUsd) : money(l.record.priceUsd)}
          </button>
        </Tooltip>
      ) : l.estimate && l.estUsd !== undefined ? (
        <Tooltip label={`List price at ${l.estimate.store}, ${l.estimate.seen}. Add the Amazon price you see`}>
          <button
            type="button"
            onClick={onCheck}
            className="shrink-0 text-right text-[13px] tabular-nums rounded-md px-1.5 h-7 cursor-default text-white/45 hover:bg-white/[0.07] hover:text-white/75"
          >
            ≈ {money(l.estUsd)}
          </button>
        </Tooltip>
      ) : (
        <Button variant="secondary" size="xs" onClick={onCheck}>
          Add Price…
        </Button>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------ */


const CheckSheet: React.FC<{ line: BomLine; onClose: () => void; onSave: (r: PurchaseRecord | null) => void }> = ({ line, onClose, onSave }) => {
  const r = line.record;
  const [url, setUrl] = useState(r?.url ?? (line.urlKind === 'product' ? line.url ?? '' : ''));
  const [title, setTitle] = useState(r?.title ?? '');
  const [pack, setPack] = useState(r?.packQty ?? (line.unit === 'g' ? 1000 : 1));
  const [price, setPrice] = useState(r?.priceUsd ?? 0);
  const [note, setNote] = useState(r?.note ?? '');
  const asin = parseAsin(url);
  const error = !url.trim() ? 'Paste the listing link.' : !asin ? 'Use an amazon.com product link (…/dp/B0…).' : price <= 0 ? 'Enter the price you saw.' : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-8 bg-black/50 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Add price" className="w-full max-w-[440px] rounded-2xl bg-[#1c1c20] ring-1 ring-white/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] animate-sheet-in">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white truncate">{line.name}</h2>
            <p className="text-[13px] text-white/50 mt-0.5">
              Need {line.unit === 'g' ? `${line.qty.toLocaleString('en-US')} g` : line.qty}
              {line.detail ? ` · ${line.detail}` : ''}
            </p>
          </div>
          <IconButton icon={<X className="w-4 h-4" />} title="Close" shortcut="Esc" size="sm" onClick={onClose} />
        </div>
        <div className="px-5 py-3 space-y-3">
          {line.url && (
            <a
              href={line.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium bg-white/[0.07] hover:bg-white/[0.11] text-white/90 cursor-default"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {line.urlKind === 'product' ? 'Open Listing' : 'Search Amazon'}
            </a>
          )}
          <Field label="Listing link">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. https://www.amazon.com/dp/B0CK2FCG1K" autoFocus />
          </Field>
          <Field label="Listing title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Raspberry Pi 5 8GB" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Price">
              <NumberInput label="$" value={price} min={0} step={1} precision={2} unit="" onChange={(v) => setPrice(v)} />
            </Field>
            <Field label={line.unit === 'g' ? 'Grams per spool' : 'Pieces per listing'}>
              <NumberInput value={pack} min={1} step={1} precision={0} unit={line.unit === 'g' ? 'g' : 'pcs'} onChange={(v) => setPack(Math.max(1, Math.round(v)))} />
            </Field>
          </div>
          <Field label="Note">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ships in 2 days, Prime" />
          </Field>
          <p className="text-[12.5px] text-white/40">Saved with today’s date. Recheck after {STALE_DAYS} days.</p>
        </div>
        <div className="flex items-center gap-2 px-5 pb-4 pt-1">
          {r && (
            <Button variant="ghost" size="sm" onClick={() => onSave(null)}>
              Remove Price
            </Button>
          )}
          <div className="flex-1 text-[12.5px] text-white/40 truncate">{url.trim() && error}</div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!!error}
            onClick={() =>
              onSave({
                url: `https://www.amazon.com/dp/${asin}`,
                asin: asin!,
                title: title.trim() || undefined,
                packQty: pack,
                priceUsd: Math.round(price * 100) / 100,
                checkedAt: localDate(),
                note: note.trim() || undefined,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60">{label}</span>
    <div className="w-[112px] shrink-0">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[12.5px] text-white/50 mb-1">{label}</span>
    {children}
  </label>
);

/* ------------------------------------------------------------------ */

const SUPPLY_GROUPS: SupplyGroup[] = ['Power', 'Wiring', 'Electronics', 'Tools', 'Filament'];

const ExtrasSection: React.FC<{ project: ProjectSettings; onChangeProject: BuildPanelProps['onChangeProject'] }> = ({ project, onChangeProject }) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const extras = project.extras ?? [];
  const set = (next: ProjectSettings['extras']) => onChangeProject({ extras: next });
  const add = (key: string) => {
    setMenu(false);
    const found = extras.find((x) => x.key === key);
    set(found ? extras.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x)) : [...extras, { key, qty: 1 }]);
  };
  return (
    <Section
      title="Supplies"
      actions={
        <div className="relative" ref={ref}>
          <IconButton icon={<Plus className="w-4 h-4" />} title="Add supply" size="xs" onClick={() => setMenu((v) => !v)} />
          <PopoverMenu isOpen={menu} onClose={() => setMenu(false)} ignoreRef={ref} position="bottom" align="end" className="w-64 max-h-[60vh] overflow-y-auto">
            {SUPPLY_GROUPS.map((g) => (
              <React.Fragment key={g}>
                <MenuLabel>{g}</MenuLabel>
                {SUPPLIES.filter((s) => s.group === g).map((s) => (
                  <MenuItem key={s.id} label={s.name} onSelect={() => add(`supply:${s.id}`)} />
                ))}
              </React.Fragment>
            ))}
          </PopoverMenu>
        </div>
      }
    >
      {extras.map((x) => {
        const s = x.key.startsWith('supply:') ? SUPPLY_BY_ID[x.key.slice(7)] : undefined;
        return (
          <div key={x.key} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white/90 truncate">{s?.name ?? x.key}</div>
              {x.note && <div className="text-[12px] text-white/40 truncate">{x.note}</div>}
            </div>
            <div className="w-[72px] shrink-0">
              <NumberInput
                value={x.qty}
                min={1}
                step={1}
                precision={0}
                unit=""
                title="Quantity"
                onChange={(v, live) => !live && set(extras.map((e) => (e.key === x.key ? { ...e, qty: Math.max(1, Math.round(v)) } : e)))}
              />
            </div>
            <IconButton icon={<X className="w-3.5 h-3.5" />} title="Remove" size="xs" onClick={() => set(extras.filter((e) => e.key !== x.key))} />
          </div>
        );
      })}
    </Section>
  );
};

/* ------------------------------------------------------------------ */

const hm = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`);

const PrintedSection: React.FC<{
  report: PrintReport | null;
  project: ProjectSettings;
  onChangeProject: BuildPanelProps['onChangeProject'];
  onSelectParts: (ids: string[]) => void;
}> = ({ report, project, onChangeProject, onSelectParts }) => {
  const parts = report?.parts ?? [];
  const t = report?.totals;
  const plates = Object.values(report?.plates ?? {}).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <Section title="Printed parts">
      <Row label="Material">
        <Select
          value={project.material}
          options={MATERIALS}
          aria-label="Material"
          onChange={(e) => onChangeProject({ material: e.target.value as PrintMaterial })}
        />
      </Row>
      <Row label="Infill">
        <NumberInput value={project.infillPct} min={5} max={100} step={5} precision={0} unit="%" title="Infill" onChange={(v, live) => !live && onChangeProject({ infillPct: v })} />
      </Row>
      {/* With no printed parts, the section is just its settings */}
      {parts.length > 0 && (
        <>
          <div className="text-[12.5px] text-white/45 tabular-nums">
            {parts.length} {parts.length === 1 ? 'part' : 'parts'} · {Math.round(t!.grams + t!.supportG).toLocaleString('en-US')} g · {hm(t!.hours)} · {plates}{' '}
            {plates === 1 ? 'plate' : 'plates'}
          </div>
          {t!.failing > 0 && (
            <Notice tone="amber" text={`Fix ${t!.failing} ${t!.failing === 1 ? 'part' : 'parts'} before printing`} onClick={() => onSelectParts(parts.filter((p) => p.issues.length).map((p) => p.id))} />
          )}
          <ul className="-mx-[7px]">
            {parts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectParts([p.id])}
                  className="w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg hover:bg-white/[0.04] text-left cursor-default"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white/90 truncate">{p.name}</div>
                    <div className="text-[12px] text-white/40 truncate tabular-nums">
                      {fmtSize(p.check.size)} mm · {hm(p.hours)}
                      {p.check.fits ? ` · Plate ${p.plate}` : ''}
                      {p.material !== project.material ? ` · ${p.material}` : ''}
                    </div>
                    {p.issues.map((issue) => (
                      <div key={issue} className={`text-[12px] mt-0.5 ${p.check.fits ? 'text-amber-400' : 'text-red-400'}`}>
                        {issue}
                      </div>
                    ))}
                  </div>
                  <span className="text-[12px] text-white/40 tabular-nums pt-[1px]">{Math.round(p.grams + p.supportG)} g</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-white/40">
            Estimate for a Bambu P1S: 2 walls, 4 top and bottom layers, {project.infillPct}% infill, best flat orientation. Slice to confirm.
          </p>
        </>
      )}
    </Section>
  );
};
