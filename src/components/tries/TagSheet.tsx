import React, { useState } from 'react';
import { Modal, TextInput } from '../../design-system';
import { cleanTag, TAG_MAX } from '../../cases/tryLabels';

interface TagSheetProps {
  onTag: (tag: string) => void;
  onClose: () => void;
}

export const TagSheet: React.FC<TagSheetProps> = ({ onTag, onClose }) => {
  const [typed, setTyped] = useState('');
  const tag = cleanTag(typed);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Tag"
      maxWidth="max-w-[360px]"
      action={{ label: 'Tag', disabled: !tag, onClick: () => onTag(tag) }}
    >
      <TextInput
        autoFocus
        data-testid="tag-field"
        value={typed}
        maxLength={TAG_MAX}
        aria-label="Tag"
        onChange={(e) => setTyped(e.target.value)}
      />
    </Modal>
  );
};
