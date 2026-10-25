import React, { useEffect, useState } from 'react';
import { Button, IconButton, MetaLine, NumberInput, TextInput, ChevronDownIcon, CloseIcon, ExternalLinkIcon } from '../../design-system';
import type { PurchaseRecord } from '../../types/robotics';
import type { BomLine } from '../../utils/bom';
import { type PurchaseForm, canSave, formatPrice, initialPurchaseForm, linkError, purchaseRecord } from './purchaseForm';

interface CheckSheetProps {
  line: BomLine;
  onClose: () => void;
  onSave: (r: PurchaseRecord | null) => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[12.5px] text-white/50 mb-1">{label}</span>
    {children}
  </label>
);

const needed = (line: BomLine) => (line.unit === 'g' ? `${line.qty.toLocaleString('en-US')} g` : line.qty);

const SheetHeader: React.FC<{ line: BomLine; onClose: () => void }> = ({ line, onClose }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold text-white truncate">{line.name}</h2>
      <MetaLine className="text-[13px] text-white/50 mt-0.5" items={[`Need ${needed(line)}`, line.detail]} />
    </div>
    <IconButton icon={<CloseIcon className="w-4 h-4" />} title="Close" shortcut="Esc" size="sm" onClick={onClose} />
  </div>
);

const ListingLink: React.FC<{ line: BomLine }> = ({ line }) => {
  if (!line.url) return null;

  return (
    <a
      href={line.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium bg-white/[0.07] hover:bg-white/[0.11] text-white/90 cursor-default"
    >
      <ExternalLinkIcon className="w-3.5 h-3.5" />
      {line.urlKind === 'product' ? 'Open Listing' : 'Search Amazon'}
    </a>
  );
};

const PriceFields: React.FC<{
  line: BomLine;
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}> = ({ line, form, onChange }) => {
  const grams = line.unit === 'g';

  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Price">
        <TextInput
          value={form.price}
          onChange={(e) => onChange({ price: e.target.value })}
          onBlur={() => onChange({ price: formatPrice(form.price) })}
          placeholder="e.g. $12.99"
          inputMode="decimal"
          className="tabular-nums"
          autoFocus
        />
      </Field>
      <Field label={grams ? 'Grams per spool' : 'Pieces per listing'}>
        <NumberInput
          value={form.pack}
          min={1}
          step={1}
          precision={0}
          unit={grams ? 'g' : 'pcs'}
          onChange={(v) => onChange({ pack: Math.max(1, Math.round(v)) })}
        />
      </Field>
    </div>
  );
};

const ListingFields: React.FC<{
  line: BomLine;
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}> = ({ line, form, onChange }) => (
  <div className="space-y-3 animate-fade-in">
    <ListingLink line={line} />
    <Field label="Listing link">
      <TextInput
        value={form.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="e.g. https://www.amazon.com/dp/B0CK2FCG1K"
      />
    </Field>
    <Field label="Listing title">
      <TextInput
        value={form.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="e.g. Raspberry Pi 5 8GB"
      />
    </Field>
    <Field label="Note">
      <TextInput
        value={form.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="e.g. ships in 2 days, Prime"
      />
    </Field>
  </div>
);

const hasListingDetails = (line: BomLine) => !!(line.record?.url || line.record?.title || line.record?.note);

const SheetFields: React.FC<{
  line: BomLine;
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}> = (props) => {
  const [showListing, setShowListing] = useState(() => hasListingDetails(props.line));

  return (
    <div className="px-5 py-3 space-y-3">
      <PriceFields {...props} />
      <button
        type="button"
        aria-expanded={showListing}
        onClick={() => setShowListing((v) => !v)}
        className="flex items-center gap-1 h-7 -ml-1 px-1 rounded-md text-[13px] text-white/60 hover:text-white/90 cursor-default"
      >
        Listing
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform duration-200 ${showListing ? 'rotate-180' : ''}`}
        />
      </button>
      {showListing && <ListingFields {...props} />}
    </div>
  );
};

export const CheckSheet: React.FC<CheckSheetProps> = ({ line, onClose, onSave }) => {
  const [form, setForm] = useState(() => initialPurchaseForm(line));
  const valid = canSave(form);
  const update = (patch: Partial<PurchaseForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-8 bg-black/50 animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add price"
        className="w-full max-w-[440px] rounded-2xl bg-[#1c1c20] ring-1 ring-white/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] animate-sheet-in"
      >
        <SheetHeader line={line} onClose={onClose} />
        <form
          onSubmit={(e) => {
            e.preventDefault();

            if (valid) onSave(purchaseRecord(form));
          }}
        >
          <SheetFields line={line} form={form} onChange={update} />
          <div className="flex items-center gap-2 px-5 pb-4 pt-1">
            {line.record && (
              <Button variant="ghost" size="sm" onClick={() => onSave(null)}>
                Remove Price
              </Button>
            )}
            <div className="flex-1 text-[12.5px] text-white/40 truncate">{linkError(form.url)}</div>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!valid}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
