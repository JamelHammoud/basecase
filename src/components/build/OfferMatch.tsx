import { useState } from 'react';
import { Button, Select, TextInput } from '../../design-system';
import type { BomLine } from '../../utils/bomTypes';
import type { SupplierOffer } from '../../types/purchasing';
import { exactOffer } from '../../utils/supplierOffers';

export function OfferMatch({
  offer,
  lines,
  onConfirm,
  initialKey,
  unitsPerOrder,
  saving,
}: {
  offer: SupplierOffer;
  lines: BomLine[];
  onConfirm: (key: string, per: number) => Promise<void>;
  initialKey?: string;
  unitsPerOrder?: number;
  saving: boolean;
}) {
  const [key, setKey] = useState(() => initialKey ?? lines.find((line) => exactOffer(offer, line))?.key ?? '');
  const [per, setPer] = useState(String(unitsPerOrder ?? offer.identity.unitsPerOrder ?? ''));
  const line = lines.find((item) => item.key === key);
  const valid =
    line &&
    exactOffer(offer, line) &&
    !!offer.identity.supplier &&
    !!offer.identity.supplierPartNumber &&
    !!offer.identity.orderingUnit &&
    Number.isFinite(Number(per)) &&
    Number(per) > 0 &&
    Number(per) <= 1e12;

  return (
    <div className="space-y-2 py-3">
      <p className="text-[13px] text-white/90">
        {offer.identity.supplier} {offer.identity.supplierPartNumber}
      </p>
      <p className="text-[13px] text-white/60">
        {offer.identity.manufacturer} {offer.identity.mpn}
      </p>
      <label className="block text-[13px] text-white/60">
        BOM item
        <Select
          value={key}
          onChange={(event) => setKey(event.target.value)}
          options={[
            { value: '', label: 'Choose an exact identity' },
            ...lines.map((item) => ({
              value: item.key,
              label: `${item.name} (${item.identity?.manufacturer ?? ''} ${item.identity?.mpn ?? ''})`,
            })),
          ]}
        />
      </label>
      <label className="block text-[13px] text-white/60">
        Units per order
        <TextInput value={per} onChange={(event) => setPer(event.target.value)} />
      </label>
      {!valid && (
        <p className="text-[13px] text-white/60">
          Match the manufacturer and part number in the listing before confirming packaging.
        </p>
      )}
      <Button disabled={!valid || saving} onClick={() => void onConfirm(key, Number(per))}>
        Confirm Match and Packaging
      </Button>
    </div>
  );
}
