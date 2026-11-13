import React, { useId, useState } from 'react';
import {
  Button,
  IconButton,
  MetaLine,
  Modal,
  NumberInput,
  TextInput,
  ChevronDownIcon,
  ExternalLinkIcon,
} from '../../design-system';
import { confirmAction } from '../../design-system/confirmStore';
import { openLink } from '../../utils/openLink';
import type { PurchaseRecord } from '../../types/robotics';
import type { BomLine } from '../../utils/bom';
import { useMoney } from '../../utils/useMoney';
import { linkLabel } from './buyLine';
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

const ListingLink: React.FC<{ line: BomLine }> = ({ line }) => {
  const { url } = line;

  if (!url) return null;

  return (
    <IconButton
      icon={<ExternalLinkIcon className="w-4 h-4" />}
      title={linkLabel(line)}
      size="sm"
      onClick={() => openLink(url)}
    />
  );
};

const PriceFields: React.FC<{
  line: BomLine;
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}> = ({ line, form, onChange }) => {
  const grams = line.unit === 'g';
  const money = useMoney();

  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Price">
        <TextInput
          value={form.price}
          onChange={(e) => onChange({ price: e.target.value })}
          onBlur={() => onChange({ price: formatPrice(form.price, money) })}
          placeholder={`e.g. ${money.format(12.99)}`}
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
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}> = ({ form, onChange }) => (
  <div className="space-y-3 animate-fade-in">
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
    <div className="space-y-3">
      <PriceFields {...props} />
      <button
        type="button"
        aria-expanded={showListing}
        onClick={() => setShowListing((v) => !v)}
        className="flex items-center gap-1 h-7 -ml-1 px-1 rounded-md text-[13px] text-white/60 hover:text-white/90 cursor-default"
      >
        Listing
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform duration-150 ${showListing ? 'rotate-180' : ''}`}
        />
      </button>
      {showListing && <ListingFields {...props} />}
    </div>
  );
};

export const CheckSheet: React.FC<CheckSheetProps> = ({ line, onClose, onSave }) => {
  const money = useMoney();
  const formId = useId();
  const [form, setForm] = useState(() => initialPurchaseForm(line, money));
  const valid = canSave(form);
  const update = (patch: Partial<PurchaseForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={line.name}
      subtitle={<MetaLine items={[`Need ${needed(line)}`, line.detail]} />}
      headerActions={<ListingLink line={line} />}
      maxWidth="max-w-[440px]"
      footer={
        <>
          {line.record && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => confirmAction({ title: `Delete price for ${line.name}?`, onConfirm: () => onSave(null) })}
            >
              Delete Price
            </Button>
          )}
          <div className="flex-1 text-[12.5px] text-white/50 truncate">{linkError(form.url)}</div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" size="sm" disabled={!valid}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();

          if (valid) onSave(purchaseRecord(form, money));
        }}
      >
        <SheetFields line={line} form={form} onChange={update} />
      </form>
    </Modal>
  );
};
