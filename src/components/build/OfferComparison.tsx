import { Button } from '../../design-system';
import type { SupplierOffers, SupplierOffer } from '../../types/purchasing';
import type { BomLine } from '../../utils/bomTypes';
import { compareOffer, purchasingStatus, type PurchasingComparison } from '../../utils/supplierOffers';

export function OfferComparison({
  result,
  books,
  onSelect,
  onEdit,
}: {
  result: PurchasingComparison;
  books: (key: string) => SupplierOffers | undefined;
  onEdit: (offer: SupplierOffer) => void;
  onSelect: (line: BomLine, id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {result.lines.map(({ line, issues }) => (
        <div key={line.key} className="space-y-2 py-3">
          <p className="text-[14px] text-white/90">{line.name}</p>
          <p className="text-[13px] text-white/60">
            {line.toBuy} {line.unit}
          </p>
          {!books(line.key)?.offers.length &&
            issues.map((issue) => (
              <p key={issue} className="text-[13px] text-white/60">
                {issue}
              </p>
            ))}
          {books(line.key)?.offers.map((entry) => {
            const compared = compareOffer(line, entry, result.plan, result.generatedAt);
            const { offer } = entry;

            return (
              <div key={offer.id} className="space-y-1">
                <Button
                  variant={books(line.key)?.selectedId === offer.id ? 'active' : 'secondary'}
                  aria-pressed={books(line.key)?.selectedId === offer.id}
                  onClick={() => void onSelect(line, offer.id)}
                >
                  {`Select ${offer.identity.supplier} ${offer.identity.supplierPartNumber}`}
                </Button>
                <Button onClick={() => onEdit(offer)}>Edit Match</Button>
                <p className="text-[13px] text-white/60">
                  {compared.orderQty ?? '?'} {offer.identity.orderingUnit} {compared.total ?? '?'} {offer.currency}
                </p>
                <p className="text-[13px] text-white/60">
                  {offer.destination} {offer.arrivalEarliest ?? '?'} / {offer.arrivalLatest ?? '?'}
                </p>
                <p className="text-[13px] text-white/60">
                  {offer.observedAt ?? '?'} {offer.source}
                </p>
                {(compared.issues.length ? compared.issues : [purchasingStatus(compared)]).map((issue) => (
                  <p key={issue} className="text-[13px] text-white/60">
                    {issue}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      ))}
      {Object.entries(result.totals).map(([currency, total]) => (
        <p key={currency} className="text-[14px] text-white/90">
          {currency} {total.toLocaleString('en-US', { maximumFractionDigits: 6 })}
        </p>
      ))}
      {result.purchasingComplete && <p className="text-[13px] text-white/60">Purchasing evidence complete</p>}
      {result.estimatedArrival && (
        <p className="text-[13px] text-white/60">{`Purchasing arrival estimate: ${result.estimatedArrival}`}</p>
      )}
      {result.unresolved.map((issue) => (
        <p key={issue} className="text-[13px] text-white/60">
          {issue}
        </p>
      ))}
    </div>
  );
}
