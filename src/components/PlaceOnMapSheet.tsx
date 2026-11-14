import React, { useState } from 'react';
import { FieldRow, Modal, NumberInput, TextInput, WebIcon } from '../design-system';
import { MAX_OFFSET_M, placeText, readPlace, type EarthOrigin } from '../earth/earthOrigin';

export const PlaceOnMapSheet: React.FC<{
  origin: EarthOrigin | null;
  onClose: () => void;
  onPlace: (origin: EarthOrigin) => void;
}> = ({ origin, onClose, onPlace }) => {
  const [text, setText] = useState(origin ? placeText(origin) : '');
  const [offsetM, setOffsetM] = useState(origin?.offsetM ?? 0);
  const place = readPlace(text);

  const submit = () => {
    if (place) onPlace({ ...place, offsetM });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Place on Map"
      icon={<WebIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      action={{ label: 'Place', disabled: !place, onClick: submit }}
    >
      <div className="space-y-4">
        <TextInput
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Place"
          placeholder="e.g. 37.7793, -122.4193 or a Google Maps link"
        />
        <FieldRow label="Height offset">
          <NumberInput
            value={offsetM}
            onChange={setOffsetM}
            min={-MAX_OFFSET_M}
            max={MAX_OFFSET_M}
            step={0.1}
            precision={1}
            unit="m"
            aria-label="Height offset"
          />
        </FieldRow>
      </div>
    </Modal>
  );
};
