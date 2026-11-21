import { useRef } from 'react';
import { Button, CloseIcon, FieldRow, IconButton } from '../../design-system';

interface Props {
  label: string;
  name: string;
  loaded: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}

export const TextureFileField = ({ label, name, loaded, disabled, onFile, onRemove }: Props) => {
  const input = useRef<HTMLInputElement>(null);

  return (
    <FieldRow label={label}>
      <div className="flex w-full items-center gap-2">
        <Button size="sm" title={name} disabled={disabled} onClick={() => input.current?.click()}>
          {loaded ? 'Replace' : 'Load'}
        </Button>
        {loaded && (
          <IconButton size="sm" title="Remove texture" icon={<CloseIcon />} disabled={disabled} onClick={onRemove} />
        )}
        <input
          ref={input}
          className="hidden"
          type="file"
          aria-label={name}
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) onFile(file);

            event.target.value = '';
          }}
        />
      </div>
    </FieldRow>
  );
};
