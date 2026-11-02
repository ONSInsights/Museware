import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import type { DesignTokens } from '../types/tokens';
import { COLOR_KEYS } from '../types/tokens';
import { ExpandContent, type ContentFeedback } from './ContentEditor';

/**
 * Draft-then-commit inputs. Every committed change is ONE op, so typing a
 * paragraph does not fill the undo stack with 40 keystrokes.
 */
function useDraft(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  const lastCommitted = useRef(value);
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setDraft(value);
    }
  }, [value]);
  const commitValue = (value: string) => {
    if (value === lastCommitted.current) return;
    lastCommitted.current = value;
    onCommit(value);
  };
  const commit = () => commitValue(draft);
  return {
    draft,
    setDraft,
    commit,
    commitValue,
    cancel: () => setDraft(lastCommitted.current),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDraft(lastCommitted.current);
      }
    },
  };
}

export function TextField({
  label,
  value,
  onCommit,
  hint,
  mono,
  placeholder,
  multiline,
  list,
  feedback,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  hint?: string;
  mono?: boolean;
  placeholder?: string;
  multiline?: boolean;
  list?: string;
  feedback?: ContentFeedback;
}) {
  const d = useDraft(value, onCommit);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? (
        <div className="content-field-wrap">
          <textarea
            ref={textareaRef}
            className="textarea"
            rows={3}
            value={d.draft}
            placeholder={placeholder}
            onChange={(e) => d.setDraft(e.target.value)}
            onBlur={() => d.commit()}
            onKeyDown={d.onKeyDown}
          />
          <ExpandContent
            title={label}
            value={d.draft}
            feedback={feedback}
            fieldRef={textareaRef}
            onSave={(next) => {
              d.setDraft(next);
              d.commitValue(next);
            }}
          />
        </div>
      ) : (
        <input
          className={mono ? 'input field-mono' : 'input'}
          value={d.draft}
          placeholder={placeholder}
          list={list}
          onChange={(e) => d.setDraft(e.target.value)}
          onBlur={() => d.commit()}
          onKeyDown={d.onKeyDown}
        />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const d = useDraft(String(Number.isFinite(value) ? value : 0), (next) => {
    const n = Number(next);
    if (Number.isFinite(n)) onCommit(n);
  });
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        aria-label={label}
        value={d.draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => d.setDraft(e.target.value)}
        onBlur={d.commit}
        onKeyDown={d.onKeyDown}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        aria-label={label}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="field-hint field-hint-block">{hint}</span>}
      </span>
    </label>
  );
}

/** The filled dot that means "overridden at this breakpoint". Tap clears it. */
export function OverrideDot({ on, title }: { on: boolean; title?: string }) {
  if (!on) return null;
  return (
    <span className="override-dot" data-tip={title || 'Overridden here — tap to inherit'} />
  );
}

export function ClearOverride({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      className="chip"
      onClick={onClear}
      title={`Revert ${label} to inherit`}
    >
      <RotateCcw size={11} /> inherit
    </button>
  );
}

export function ColorField({
  label,
  value,
  tokens,
  onCommit,
  allowTransparent = false,
  overridden = false,
  onClearOverride,
  onScope,
}: {
  label: string;
  value: string;
  tokens: DesignTokens;
  onCommit: (v: string) => void;
  allowTransparent?: boolean;
  overridden?: boolean;
  onClearOverride?: () => void;
  onScope?: (hex: string) => void;
}) {
  const colors = tokens.openuiTheme.light_colors || {};
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!menuPosition || !menuRef.current) return;
    const menu = menuRef.current;
    menu.style.right = `${menuPosition.right}px`;
    menu.style.top = `${Math.max(8, Math.min(menuPosition.top, window.innerHeight - menu.offsetHeight - 8))}px`;
  }, [menuPosition]);
  useEffect(() => {
    if (!menuPosition) return;
    const close = () => {
      if (detailsRef.current) detailsRef.current.open = false;
      setMenuPosition(null);
    };
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!detailsRef.current?.contains(target) && !menuRef.current?.contains(target))
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuPosition]);
  const d = useDraft(value, (next) => {
    if (onScope && /^#[0-9a-fA-F]{6}$/.test(next)) onScope(next);
    else onCommit(next);
  });
  const isVar = d.draft.startsWith('var(--');
  const currentVar = isVar
    ? d.draft
        .replace(/^var\(--/, '')
        .replace(/\)$/, '')
        .replace(/-/g, '_')
    : '';
  return (
    <div className="field color-field">
      <span className="field-label">
        <span className="field-label-inline">
          {label}
          <OverrideDot on={overridden} />
        </span>
      </span>
      <div className="color-field-row">
        <svg className="color-field-swatch" aria-hidden="true">
          <rect
            width="100%"
            height="100%"
            fill={colors[currentVar as keyof typeof colors] || d.draft || 'transparent'}
          />
        </svg>
        <input
          aria-label={label}
          className="input field-mono"
          value={d.draft}
          placeholder="var(--openui-accent) or #RRGGBB"
          onChange={(e) => d.setDraft(e.target.value)}
          onBlur={d.commit}
          onKeyDown={d.onKeyDown}
        />
        <details
          className="color-field-tokens"
          ref={detailsRef}
          onToggle={(e) => {
            if (!e.currentTarget.open) {
              setMenuPosition(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({
              top: rect.bottom,
              right: Math.max(8, window.innerWidth - rect.right),
            });
          }}
        >
          <summary aria-label={`Choose ${label} token`} title="Choose a color token">
            ▾
          </summary>
          {menuPosition &&
            createPortal(
              <div ref={menuRef} className="swatch-grid color-field-menu">
                {allowTransparent && (
                  <button
                    type="button"
                    className="swatch swatch-transparent"
                    aria-label="Transparent"
                    data-selected={!d.draft}
                    onClick={() => {
                      onCommit('');
                      if (detailsRef.current) detailsRef.current.open = false;
                      setMenuPosition(null);
                    }}
                  />
                )}
                {COLOR_KEYS.map((key) => (
                  <button
                    type="button"
                    key={key}
                    className="swatch"
                    aria-label={key.replace(/_/g, '-')}
                    data-tip={key.replace(/_/g, '-')}
                    data-selected={currentVar === key}
                    onClick={() => {
                      onCommit(`var(--${key.replace(/_/g, '-')})`);
                      if (detailsRef.current) detailsRef.current.open = false;
                      setMenuPosition(null);
                    }}
                  >
                    <svg aria-hidden="true" width="100%" height="100%">
                      <rect width="100%" height="100%" fill={colors[key]} />
                    </svg>
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </details>
        {onClearOverride && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label={`Revert ${label}`}
            title="Revert to inherit"
            onClick={onClearOverride}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {onScope && /^#[0-9a-fA-F]{6}$/.test(d.draft) && (
        <button
          type="button"
          className="chip color-field-scope"
          onClick={() => onScope(d.draft)}
        >
          Choose scope
        </button>
      )}
    </div>
  );
}

export function SpacingField({
  label,
  value,
  onCommit,
  suggestions,
  overridden = false,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  suggestions: string[];
  overridden?: boolean;
}) {
  const d = useDraft(value, onCommit);
  return (
    <div className="field">
      <span className="field-label">
        <span className="field-label-inline">
          {label}
          <OverrideDot on={overridden} />
        </span>
      </span>
      <input
        className="input field-mono"
        value={d.draft}
        placeholder={suggestions[0]}
        onChange={(e) => d.setDraft(e.target.value)}
        onBlur={d.commit}
        onKeyDown={d.onKeyDown}
      />
      <div className="field-suggestions">
        {suggestions.map((token) => (
          <button
            type="button"
            key={token}
            className="chip field-suggestion"
            data-selected={d.draft === token}
            onClick={() => onCommit(token)}
          >
            {token === '0' || token === 'auto'
              ? token
              : token.replace(/^var\(--/, '').replace(/\)$/, '')}
          </button>
        ))}
      </div>
    </div>
  );
}
