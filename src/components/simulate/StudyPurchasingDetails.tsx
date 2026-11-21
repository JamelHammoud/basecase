import { useState } from 'react';
import { Button, ErrorBoundary } from '../../design-system';
import { sourcingBom, type StudyPurchasingResult } from '../../study/sourcing';
import { purchasingStatus } from '../../utils/supplierOffers';
import { SupplierOfferSheet } from '../build/SupplierOfferSheet';
import { usePurchases } from '../build/usePurchases';

export function StudyPurchasingDetails({ result, scene }: { result: StudyPurchasingResult; scene: string }) {
  const [editing, setEditing] = useState(false);
  const [purchases, save] = usePurchases();

  return (
    <div
      className="col-span-4 min-w-0 break-words flex flex-col gap-2 py-2 text-[12px] text-white/60"
      data-testid="study-purchasing"
    >
      <p>{result.generatedAt}</p>
      <p>{`${result.plan.destination} / ${result.plan.requiredBy}`}</p>
      {result.lines.map((item) => (
        <div key={item.line.key}>
          <p>{`${item.line.name}: ${item.line.qty} ${item.line.unit}, ${purchasingStatus(item)}`}</p>
          {item.selected && <p>{item.selected.offer.source}</p>}
        </div>
      ))}
      {Object.entries(result.totals).map(([currency, total]) => (
        <p key={currency}>{`${currency} ${total}`}</p>
      ))}
      {result.estimatedArrival && <p>{`Purchasing arrival estimate: ${result.estimatedArrival}`}</p>}
      {result.unresolved.map((issue) => (
        <p key={issue}>{issue}</p>
      ))}
      <Button
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        Supplier Offers
      </Button>
      {editing && (
        <ErrorBoundary region="Supplier offers" onClose={() => setEditing(false)}>
          <SupplierOfferSheet
            bom={sourcingBom(result)}
            initialPlan={result.plan}
            purchases={purchases}
            scene={scene}
            save={save}
            onClose={() => setEditing(false)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
