import { useSyncExternalStore } from 'react';
import { Modal } from '../../design-system/Modal';
import { phoneSnapshot, subscribePhone, unpairPhone } from '../../phone/phoneStore';
import { PAIR_PHONE } from './pairPhoneLabel';
import { QrCode } from './QrCode';

export function PairPhoneHost() {
  const phone = useSyncExternalStore(subscribePhone, phoneSnapshot);

  return (
    <Modal
      isOpen={phone.status === 'pairing'}
      onClose={() => void unpairPhone()}
      title={PAIR_PHONE}
      maxWidth="max-w-sm"
    >
      <div className="flex justify-center px-[20px] pb-[24px]">
        {phone.status === 'pairing' && <QrCode text={phone.url} label={PAIR_PHONE} />}
      </div>
    </Modal>
  );
}
