import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2 } from 'lucide-react';
import { Modal } from '../components/ui';
import { accordionItems } from '../types/editorial';

export type ContentFeedback = 'rows' | 'accordion';
export function contentFeedback(value: string, kind?: ContentFeedback): string {
  if (kind === 'accordion') {
    const count = accordionItems(value).length;
    return `${count} Question | Answer ${count === 1 ? 'pair' : 'pairs'}`;
  }
  if (kind === 'rows') {
    const lines = value.split(/\r?\n/).filter((line) => line.trim());
    const fields = lines.map((line) => line.split('|').length);
    const min = fields.length ? Math.min(...fields) : 0;
    const max = fields.length ? Math.max(...fields) : 0;
    return `${lines.length} rows · ${min === max ? min : `${min}–${max}`} fields per row`;
  }
  return '';
}

export function ContentEditor({
  title,
  value,
  feedback,
  onSave,
  onCancel,
}: {
  title: string;
  value: string;
  feedback?: ContentFeedback;
  onSave: (value: string) => string | void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const save = () => {
    const result = onSave(draft);
    if (result) {
      setError(result);
      return;
    }
    onCancel();
  };
  return createPortal(
    <div
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <Modal
        title={title}
        className="content-editor-modal"
        onClose={onCancel}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save}>
              Save
            </button>
          </>
        }
      >
        <textarea
          ref={input}
          className="textarea content-editor-textarea"
          aria-label={`${title} content`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
        />
        {feedback && (
          <div className="field-hint" aria-live="polite">
            {contentFeedback(draft, feedback)}
          </div>
        )}
        {error && (
          <p role="alert" className="field-hint">
            {error}
          </p>
        )}
      </Modal>
    </div>,
    document.body,
  );
}

/** Trigger and overlay share the source field's draft; cancel never commits overlay edits. */
export function ExpandContent({
  title,
  value,
  feedback,
  onSave,
  fieldRef,
  onOpen,
  onClose,
}: {
  title: string;
  value: string;
  feedback?: ContentFeedback;
  onSave: (value: string) => string | void;
  fieldRef: React.RefObject<HTMLTextAreaElement>;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
    requestAnimationFrame(() => fieldRef.current?.focus());
  };
  return (
    <>
      <button
        type="button"
        className="content-expand icon-btn icon-btn-sm"
        aria-label={`Expand ${title}`}
        title={`Expand ${title}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        <Maximize2 size={13} />
      </button>
      {open && (
        <ContentEditor
          title={title}
          value={value}
          feedback={feedback}
          onSave={onSave}
          onCancel={close}
        />
      )}
    </>
  );
}
