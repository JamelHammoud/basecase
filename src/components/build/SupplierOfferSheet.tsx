import { useSupplierOffers } from './useSupplierOffers';
import { Button, Modal, TextInput } from '../../design-system';
import type { Bom } from '../../utils/bomTypes';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { purchasingCsv } from '../../utils/supplierOffers';
import { OFFER_COLUMNS } from '../../utils/supplierOfferCsv';
import { csvCell } from '../../utils/csvCell';
import { download } from './format';
import { OfferMatch } from './OfferMatch';
import { OfferFields } from './OfferFields';
import { OfferComparison } from './OfferComparison';

export function SupplierOfferSheet({
  bom,
  purchases,
  scene,
  save,
  onClose,
}: {
  bom: Bom;
  purchases: Purchases;
  scene: string;
  save: (key: string, record: StoredPurchase | null) => Promise<void>;
  onClose: () => void;
}) {
  const {
    planKey,
    plan,
    setPlan,
    drafts,
    setDrafts,
    entering,
    setEntering,
    error,
    result,
    attempt,
    imported,
    confirm,
  } = useSupplierOffers({ bom, purchases, scene, save });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Supplier offers"
      maxWidth="max-w-[680px]"
      action={{
        label: 'Export Purchasing Plan',
        onClick: () =>
          download(`${scene}-purchasing-${result.generatedAt.slice(0, 10)}.csv`, purchasingCsv(result), 'text/csv'),
      }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[13px] text-white/60">
            Destination
            <TextInput
              value={plan.destination}
              onChange={(event) => setPlan({ ...plan, destination: event.target.value })}
            />
          </label>
          <label className="block text-[13px] text-white/60">
            Required arrival date
            <TextInput
              type="date"
              value={plan.requiredBy}
              onChange={(event) => setPlan({ ...plan, requiredBy: event.target.value })}
            />
          </label>
        </div>
        <Button onClick={() => void attempt(() => save(planKey, { purchasePlan: plan }))}>Save</Button>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEntering(!entering)} aria-expanded={entering}>
            Enter Quote
          </Button>
          <Button
            onClick={() => download('supplier-offers.csv', OFFER_COLUMNS.map(csvCell).join(',') + '\n', 'text/csv')}
          >
            Download CSV Template
          </Button>
        </div>
        <label className="block text-[13px] text-white/60">
          Import Supplier CSV
          <input
            className="block h-[32px] text-[13px]"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              void imported(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        {entering && (
          <OfferFields
            onAdd={(offer) => {
              setDrafts((items) => [...items, offer]);
              setEntering(false);
            }}
          />
        )}
        {error && (
          <p role="alert" className="text-[13px] text-white/90">
            {error}
          </p>
        )}
        {drafts.map((offer) => (
          <OfferMatch
            key={offer.id}
            offer={offer}
            lines={bom.lines}
            onConfirm={(key, per) => confirm(offer, key, per)}
          />
        ))}
        <OfferComparison
          result={result}
          books={(key) => purchases[key]?.supplierOffers}
          onEdit={(offer) => setDrafts((items) => [...items.filter((item) => item.id !== offer.id), offer])}
          onSelect={(line, id) =>
            attempt(() =>
              save(line.key, {
                ...purchases[line.key],
                supplierOffers: { offers: purchases[line.key].supplierOffers!.offers, selectedId: id },
              }),
            )
          }
        />
      </div>
    </Modal>
  );
}
