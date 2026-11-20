import { useState } from 'react';
import { Button, TextInput } from '../../design-system';
import { OFFER_COLUMNS, offerFromCells } from '../../utils/supplierOfferCsv';
import type { SupplierOffer } from '../../types/purchasing';
import { errorMessage } from '../../utils/errorMessage';

export function OfferFields({ onAdd }: { onAdd: (offer: SupplierOffer) => void }) {
  const [cells, setCells] = useState(() => OFFER_COLUMNS.map((_, i) => (i === 10 ? new Date().toISOString() : '')));
  const [error, setError] = useState('');
  const add = () => {
    try {
      onAdd(offerFromCells(cells, '', 'entered'));
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {OFFER_COLUMNS.map((label, index) => (
          <label key={label} className="block text-[13px] text-white/60">
            {label.charAt(0) + label.slice(1).toLowerCase()}
            <TextInput
              value={cells[index]}
              onChange={(event) => setCells(cells.map((value, i) => (i === index ? event.target.value : value)))}
            />
          </label>
        ))}
      </div>
      <p className="text-[13px] text-white/60">Quantity breaks use order quantities and prices, such as 1:12|10:10.</p>
      {error && (
        <p role="alert" className="text-[13px] text-white/90">
          {error}
        </p>
      )}
      <Button onClick={add}>Add Quote</Button>
    </div>
  );
}
