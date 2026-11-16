import { TextInput } from '../../design-system';
import type { PurchaseIdentity } from '../../types/purchasing';
import type { PurchaseForm } from './purchaseForm';

const fields = [
  ['manufacturer', 'Manufacturer'],
  ['mpn', 'Manufacturer part number'],
  ['supplier', 'Supplier'],
  ['supplierPartNumber', 'Supplier part number'],
  ['orderingUnit', 'Ordering unit'],
] as const;

export function IdentityFields({
  form,
  onChange,
}: {
  form: PurchaseForm;
  onChange: (patch: Partial<PurchaseForm>) => void;
}) {
  const identity = form.identity ?? {};
  const update = (patch: Partial<PurchaseIdentity>) =>
    onChange({ identity: { ...identity, ...patch, sourceUrl: form.url.trim() || undefined } });

  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(([key, label]) => (
        <label key={key} className="block">
          <span className="block text-[12.5px] text-white/50 mb-1">{label}</span>
          <TextInput value={identity[key] ?? ''} onChange={(event) => update({ [key]: event.target.value })} />
        </label>
      ))}
      <label className="block">
        <span className="block text-[12.5px] text-white/50 mb-1">Units per order</span>
        <TextInput
          inputMode="decimal"
          value={identity.unitsPerOrder ?? ''}
          onChange={(event) => update({ unitsPerOrder: Number(event.target.value) || undefined })}
        />
      </label>
    </div>
  );
}
