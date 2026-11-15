import { Button } from '../../design-system/Button';
import { IconButton } from '../../design-system/IconButton';
import { DeleteIcon } from '../../design-system/toolIcons';
import type { LabelEditor } from './useLabelEditor';

export default function LabelList({ editor }: { editor: LabelEditor }) {
  const labels = editor.frame?.annotations ?? [];
  const hasSuggestions = labels.some((label) => label.review === 'suggested');

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-white/90">Labels</h3>
        <IconButton
          icon={<DeleteIcon className="w-4 h-4" />}
          title="Delete label"
          shortcut="⌫"
          variant="danger"
          disabled={!editor.label || editor.busy}
          onClick={editor.remove}
        />
      </div>
      {labels.map((label, index) => (
        <Button
          key={label.instance}
          fullWidth
          variant={editor.selected === label.instance ? 'active' : 'ghost'}
          disabled={editor.busy}
          aria-label={`${editor.set.classes.find((category) => category.id === label.classId)?.name} ${index + 1}`}
          className="justify-start"
          onClick={() => editor.select(label)}
        >
          {editor.set.classes.find((category) => category.id === label.classId)?.name}
          {label.review === 'suggested' ? ' (unreviewed)' : ''}
        </Button>
      ))}
      {hasSuggestions && (
        <Button
          fullWidth
          shortcut="A"
          disabled={editor.busy || (Boolean(editor.label) && editor.label?.review !== 'suggested')}
          onClick={editor.accept}
        >
          {editor.label ? 'Accept Label' : 'Accept Labels'}
        </Button>
      )}
    </section>
  );
}
