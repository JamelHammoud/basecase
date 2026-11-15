import { useState } from 'react';
import { Button } from '../../design-system/Button';
import { TextInput, Select } from '../../design-system/Field';
import { IconButton } from '../../design-system/IconButton';
import { PlusIcon } from '../../design-system/glyphs';
import { EditIcon } from '../../design-system/toolIcons';
import { RenameField } from '../../design-system/RenameField';
import type { LabelEditor } from './useLabelEditor';

export default function LabelClassPanel({ editor }: { editor: LabelEditor }) {
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-white/90">Classes</h3>
        <IconButton
          title="Add class"
          icon={<PlusIcon className="w-4 h-4" />}
          disabled={editor.busy}
          onClick={() => setAdding(!adding)}
        />
      </div>
      {editor.set.classes.length > 0 && (
        <Select
          aria-label="Class"
          value={editor.classId}
          disabled={editor.busy}
          options={editor.set.classes.map((category) => ({ value: String(category.id), label: category.name }))}
          onChange={(event) => {
            setRenaming(false);
            editor.chooseClass(Number(event.target.value));
          }}
        />
      )}
      {editor.category && (
        <div className="flex items-center gap-2">
          {renaming ? (
            <RenameField
              name={editor.category.name}
              label="Class name"
              className="!h-[32px]"
              onDone={(value) => {
                setRenaming(false);

                if (value) editor.renameClass(value);
              }}
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={<EditIcon className="w-4 h-4" />}
              disabled={editor.busy}
              onClick={() => setRenaming(true)}
            >
              Rename Class
            </Button>
          )}
        </div>
      )}
      {adding && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            editor.addClass(name);
            setName('');
          }}
        >
          <TextInput
            aria-label="New class name"
            placeholder="e.g. Cup"
            value={name}
            disabled={editor.busy}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || editor.busy}>
            Add Class
          </Button>
        </form>
      )}
      {editor.tool === 'keypoint' && (
        <label className="block space-y-2 text-[13px] text-white/60">
          <span>Keypoint name</span>
          <TextInput
            value={editor.pointName}
            placeholder="e.g. Handle"
            disabled={editor.busy}
            onChange={(event) => editor.setPointName(event.target.value)}
          />
        </label>
      )}
    </section>
  );
}
